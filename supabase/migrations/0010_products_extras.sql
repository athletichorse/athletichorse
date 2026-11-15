-- =====================================================================
-- 0010_products_extras.sql — item card extras and price updates.
--  * wholesale price, reorder level, sale price for a period (from–to, Riyadh dates)
--  * the price used everywhere (cashier, search, offline price list) is the sale
--    price while it runs, otherwise the normal price
--  * names & prices update by SKU (file import), every change logged
-- Safe to run more than once.
-- =====================================================================

alter table public.product_variants add column if not exists wholesale_price numeric(12,2);
alter table public.product_variants add column if not exists reorder_level numeric(12,3);
alter table public.product_variants add column if not exists sale_price numeric(12,2);
alter table public.product_variants add column if not exists sale_from date;
alter table public.product_variants add column if not exists sale_to date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'product_variants_extras_check') then
    alter table public.product_variants add constraint product_variants_extras_check check (
      (wholesale_price is null or wholesale_price >= 0)
      and (reorder_level is null or reorder_level >= 0)
      and (sale_price is null or sale_price >= 0)
      and (sale_from is null or sale_to is null or sale_to >= sale_from));
  end if;
end $$;

-- Today's selling price (VAT-inclusive): the sale price while its period runs (Riyadh date).
create or replace function public.price_now(p_price numeric, p_sale numeric, p_from date, p_to date)
returns numeric
language sql
stable
set search_path = public
as $$
  select case
    when p_sale is not null
     and (p_from is not null or p_to is not null)
     and (now() at time zone 'Asia/Riyadh')::date between coalesce(p_from, '-infinity'::date) and coalesce(p_to, 'infinity'::date)
    then p_sale else p_price end;
$$;

-- Same columns as before; `price` is now today's price (sale price while it runs).
create or replace view public.variant_search with (security_invoker = true) as
select v.id as variant_id, v.sku, public.price_now(v.price, v.sale_price, v.sale_from, v.sale_to)::numeric(12,2) as price,
       v.option1, v.option2, v.option3, v.active, v.image_url,
       p.id as product_id, p.name_en, p.name_ar, p.is_service, p.active as product_active,
       lower(p.name_en || ' ' || p.name_ar || ' ' || coalesce(v.sku, '') || ' ' || coalesce(v.shopify_sku, '') || ' ' ||
             coalesce(v.option1, '') || ' ' || coalesce(v.option2, '') || ' ' ||
             coalesce((select string_agg(c.code, ' ') from public.product_codes c where c.variant_id = v.id), '')) as search
  from public.product_variants v
  join public.products p on p.id = v.product_id;
revoke all on public.variant_search from anon, authenticated;

-- Labels and the price file preview read from here.
create or replace view public.variant_prices with (security_invoker = true) as
select v.id as variant_id, v.sku, p.id as product_id, p.name_en, p.name_ar,
       v.option1, v.option2, v.option3, v.price, v.wholesale_price, v.cost, v.reorder_level,
       v.sale_price, v.sale_from, v.sale_to, public.price_now(v.price, v.sale_price, v.sale_from, v.sale_to)::numeric(12,2) as price_now,
       v.shopify_variant_id is not null as on_website, v.active and p.active as active
  from public.product_variants v
  join public.products p on p.id = v.product_id;
revoke all on public.variant_prices from anon, authenticated;

-- ---------------------------------------------------------------------
-- Names & prices file: p_rows = [{sku, name_en?, name_ar?, price?, wholesale?, cost?}]
-- Only the given fields change. Website items keep the website's price and
-- English name (they come from the website). Returns what changed.
-- ---------------------------------------------------------------------
create or replace function public.update_names_prices(p_rows jsonb, p_user uuid, p_can_cost boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb; v record; n_upd int := 0; n_missing int := 0; n_web int := 0; missing text[] := '{}';
  v_price numeric(12,2); v_whole numeric(12,2); v_cost numeric(12,2); changed boolean;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    select pv.id, pv.product_id, pv.price, pv.wholesale_price, pv.cost, pv.shopify_variant_id, p.name_en, p.name_ar
      into v from product_variants pv join products p on p.id = pv.product_id where pv.sku = r->>'sku';
    if not found then
      n_missing := n_missing + 1;
      if array_length(missing, 1) is null or array_length(missing, 1) < 50 then missing := missing || (r->>'sku'); end if;
      continue;
    end if;
    changed := false;
    v_price := nullif(r->>'price', '')::numeric(12,2);
    v_whole := nullif(r->>'wholesale', '')::numeric(12,2);
    v_cost := case when p_can_cost then nullif(r->>'cost', '')::numeric(12,2) end;
    if v_price is not null and v.shopify_variant_id is not null and v_price <> v.price then n_web := n_web + 1; v_price := null; end if;
    if (v_price is not null and v_price <> v.price) or (v_whole is not null and v_whole is distinct from v.wholesale_price)
       or (v_cost is not null and v_cost is distinct from v.cost) then
      update product_variants set price = coalesce(v_price, price), wholesale_price = coalesce(v_whole, wholesale_price), cost = coalesce(v_cost, cost)
       where id = v.id;
      changed := true;
    end if;
    if (nullif(r->>'name_ar', '') is not null and r->>'name_ar' <> v.name_ar)
       or (v.shopify_variant_id is null and nullif(r->>'name_en', '') is not null and r->>'name_en' <> v.name_en) then
      update products set name_ar = coalesce(nullif(r->>'name_ar', ''), name_ar),
                          name_en = case when v.shopify_variant_id is null then coalesce(nullif(r->>'name_en', ''), name_en) else name_en end
       where id = v.product_id;
      changed := true;
    end if;
    if changed then n_upd := n_upd + 1; end if;
  end loop;
  insert into audit_log (user_id, action, entity, entity_id, details)
  values (p_user, 'products.prices_import', 'product', null, jsonb_build_object('updated', n_upd, 'not_found', n_missing, 'website_price_kept', n_web));
  return jsonb_build_object('updated', n_upd, 'not_found', n_missing, 'website_price_kept', n_web, 'missing', to_jsonb(missing));
end;
$$;

revoke all on function public.update_names_prices(jsonb, uuid, boolean) from public, anon, authenticated;
grant execute on function public.update_names_prices(jsonb, uuid, boolean) to service_role;
revoke all on function public.price_now(numeric, numeric, date, date) from public, anon, authenticated;
grant execute on function public.price_now(numeric, numeric, date, date) to service_role;
