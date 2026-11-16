-- =====================================================================
-- 0015_shopify_two_way.sql — portal → website.
--  * Switches (all OFF until the owner turns them on in Company → Website):
--      shopify_push_prices  portal prices (incl. sale prices) are sent to the website;
--                           website items' prices become editable in the portal
--      shopify_push_stock   the website stock location's quantities are sent to the website
--      web_orders_to_quotes new website orders become quotations to collect at the till
--  * web_push_rows(): what to send for some (or all) website items.
--  * update_web_prices(): price file for website items when prices are pushed.
--  * "Paid on website" payment method for collecting website orders.
-- Only adds: safe to run more than once.
-- =====================================================================

insert into public.settings (key, value) values
  ('shopify_push_prices', 'false'::jsonb),
  ('shopify_push_stock', 'false'::jsonb),
  ('web_orders_to_quotes', 'false'::jsonb)
on conflict (key) do nothing;

insert into public.payment_methods (code, name_ar, name_en, kind, opens_drawer, sort) values
  ('website', 'مدفوع في الموقع', 'Paid on website', 'transfer', false, 65)
on conflict (code) do nothing;

alter table public.web_orders add column if not exists quotation_id uuid references public.quotations(id) on delete set null;

-- What the website should show for these items (null = every website item).
create or replace function public.web_push_rows(p_variant_ids uuid[])
returns table (variant_id uuid, shopify_product_id bigint, shopify_variant_id bigint, price numeric, list_price numeric, qty numeric)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, p.shopify_product_id, v.shopify_variant_id,
         public.price_now(v.price, v.sale_price, v.sale_from, v.sale_to)::numeric(12,2), v.price,
         coalesce((select s.qty from stock_levels s
                    where s.variant_id = v.id
                      and s.location_id = (select (value #>> '{}')::uuid from settings where key = 'website_stock_location')), 0)
    from product_variants v
    join products p on p.id = v.product_id
   where v.shopify_variant_id is not null and p.shopify_product_id is not null and not p.is_service
     and (p_variant_ids is null or v.id = any(p_variant_ids));
$$;

-- Price file for website items (only when prices are pushed). Returns the changed variant ids.
create or replace function public.update_web_prices(p_rows jsonb, p_user uuid)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare r jsonb; v_id uuid; v_price numeric(12,2); ids uuid[] := '{}';
begin
  if coalesce((select value from settings where key = 'shopify_push_prices'), 'false'::jsonb) <> 'true'::jsonb then return ids; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_price := nullif(r->>'price', '')::numeric(12,2);
    if v_price is null or v_price < 0 then continue; end if;
    update product_variants set price = v_price
     where sku = r->>'sku' and shopify_variant_id is not null and price <> v_price
    returning id into v_id;
    if v_id is not null then ids := ids || v_id; v_id := null; end if;
  end loop;
  if array_length(ids, 1) > 0 then
    insert into audit_log (user_id, action, entity, entity_id, details)
    values (p_user, 'products.web_prices_import', 'product', null, jsonb_build_object('updated', array_length(ids, 1)));
  end if;
  return ids;
end;
$$;

revoke all on function public.web_push_rows(uuid[]) from public, anon, authenticated;
grant execute on function public.web_push_rows(uuid[]) to service_role;
revoke all on function public.update_web_prices(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.update_web_prices(jsonb, uuid) to service_role;
