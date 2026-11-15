-- =====================================================================
-- 0004_product_import.sql — spreadsheet import of products ("Upload file").
--  * SKUs / codes may also contain # * + (used by existing labels).
--  * import_ref keys so the same file can be imported again without duplicates.
--  * import_products(): one transaction per chunk, idempotent.
-- Safe to run more than once.
-- =====================================================================

-- Wider code characters --------------------------------------------------
alter table public.product_variants drop constraint if exists product_variants_sku_check;
alter table public.product_variants add constraint product_variants_sku_check
  check (sku is null or sku ~ '^[A-Za-z0-9._/#*+-]{1,40}$');
alter table public.product_codes drop constraint if exists product_codes_code_check;
alter table public.product_codes add constraint product_codes_code_check
  check (code ~ '^[A-Za-z0-9._/#*+-]{1,40}$');

-- Import keys --------------------------------------------------------------
alter table public.products         add column if not exists import_ref text;
alter table public.product_variants add column if not exists import_ref text;
create unique index if not exists products_import_ref_uq         on public.products (import_ref)         where import_ref is not null;
create unique index if not exists product_variants_import_ref_uq on public.product_variants (import_ref) where import_ref is not null;
create unique index if not exists product_images_product_url_uq  on public.product_images (product_id, url);

-- ---------------------------------------------------------------------------
-- p_rows: array of {ref, sku, name_ar, name_en, group_ar, group_en, unit, codes[],
--                   price, active, service, model, option1, option2, images[]}
-- Prices arrive already converted to SAR by the server (never from the browser).
-- Matching an existing item: import_ref → SKU → website SKU (if unique) → extra code.
-- Website items keep their website price and English name; the file only fills
-- what is missing (Arabic name, group, extra codes, unit).
-- ---------------------------------------------------------------------------
create or replace function public.import_products(p_rows jsonb, p_vendor text default 'Alhisan Alriyadi')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb; c text; u text;
  v_id uuid; p_id uuid; g_id uuid; web boolean;
  v_sku text; v_ref text; v_price numeric(12,2);
  n_new_p int := 0; n_new_v int := 0; n_upd int := 0; n_web int := 0; n_codes int := 0; n_code_skip int := 0; n_img int := 0;
  n_amb int := 0; n_prod int; p_text text;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_ref := 'file:' || (r->>'ref');
    v_sku := nullif(r->>'sku', '');
    v_price := nullif(r->>'price', '')::numeric(12,2);

    -- group (matched by Arabic or English name)
    g_id := null;
    if nullif(r->>'group_ar', '') is not null then
      select id into g_id from product_groups
       where parent_id is null and (name_ar = r->>'group_ar' or lower(name_en) = lower(coalesce(nullif(r->>'group_en', ''), r->>'group_ar')))
       limit 1;
      if g_id is null then
        insert into product_groups (name_en, name_ar) values (coalesce(nullif(r->>'group_en', ''), r->>'group_ar'), r->>'group_ar')
        on conflict ((lower(name_en))) where parent_id is null do update set name_ar = coalesce(nullif(product_groups.name_ar, ''), excluded.name_ar)
        returning id into g_id;
      end if;
    end if;

    -- find an existing item
    select id, product_id into v_id, p_id from product_variants where import_ref = v_ref;
    if v_id is null and v_sku is not null then
      select id, product_id into v_id, p_id from product_variants where sku = v_sku;
    end if;
    if v_id is null and v_sku is not null and (select count(*) from product_variants where shopify_sku = v_sku) = 1 then
      select id, product_id into v_id, p_id from product_variants where shopify_sku = v_sku;
    end if;
    if v_id is null and v_sku is not null then
      select v.id, v.product_id into v_id, p_id from product_codes pc join product_variants v on v.id = pc.variant_id where pc.code = v_sku;
    end if;
    -- The website uses this SKU on several items: same product → enrich that product;
    -- different products → ambiguous, skip (the owner fixes the SKUs on the website).
    if v_id is null and v_sku is not null then
      select count(distinct product_id), min(product_id::text) into n_prod, p_text
        from product_variants where shopify_sku = v_sku and shopify_variant_id is not null;
      if n_prod = 1 then
        update products set
          name_ar  = case when name_ar = '' then coalesce(r->>'name_ar', '') else name_ar end,
          group_id = coalesce(group_id, g_id)
         where id = p_text::uuid;
        n_web := n_web + 1;
        continue;
      elsif n_prod > 1 then
        n_amb := n_amb + 1;
        continue;
      end if;
    end if;

    if v_id is not null then
      select shopify_variant_id is not null into web from product_variants where id = v_id;
      update products set
        name_ar  = case when name_ar = '' then coalesce(r->>'name_ar', '') else name_ar end,
        group_id = coalesce(group_id, g_id),
        unit     = case when unit = 'piece' and coalesce(r->>'unit', '') <> '' then r->>'unit' else unit end
       where id = p_id;
      update product_variants set
        import_ref = coalesce(import_ref, case when not exists (select 1 from product_variants o where o.import_ref = v_ref) then v_ref end),
        sku = coalesce(sku, case when v_sku is not null
                                   and not exists (select 1 from product_variants o where o.sku = v_sku)
                                   and not exists (select 1 from product_codes pc where pc.code = v_sku) then v_sku end),
        price = case when not web and v_price is not null then v_price else price end
       where id = v_id;
      if web then n_web := n_web + 1; else n_upd := n_upd + 1; end if;
    else
      -- one product per model code, otherwise one product per row
      insert into products (import_ref, name_en, name_ar, group_id, unit, is_service, vendor, options)
      values (case when nullif(r->>'model', '') is not null then 'model:' || (r->>'model') else v_ref end,
              coalesce(nullif(r->>'name_en', ''), coalesce(r->>'name_ar', '')),
              coalesce(r->>'name_ar', ''),
              g_id,
              coalesce(nullif(r->>'unit', ''), 'piece'),
              coalesce((r->>'service')::boolean, false),
              p_vendor,
              case when nullif(r->>'model', '') is not null then '["Colour","Size"]'::jsonb else '[]'::jsonb end)
      on conflict (import_ref) where import_ref is not null do update set group_id = coalesce(products.group_id, excluded.group_id)
      returning id, (xmax = 0) into p_id, web;          -- web reused as "inserted"
      if web then n_new_p := n_new_p + 1; end if;

      insert into product_variants (product_id, import_ref, sku, option1, option2, price, active)
      values (p_id, v_ref,
              case when v_sku is not null and not exists (select 1 from product_codes pc where pc.code = v_sku) then v_sku end,
              nullif(r->>'option1', ''), nullif(r->>'option2', ''),
              coalesce(v_price, 0),
              coalesce((r->>'active')::boolean, true))
      returning id into v_id;
      n_new_v := n_new_v + 1;
    end if;

    -- extra codes: add what is free, skip clashes
    for c in select jsonb_array_elements_text(coalesce(r->'codes', '[]'::jsonb)) loop
      if c ~ '^[A-Za-z0-9._/#*+-]{1,40}$'
         and not exists (select 1 from product_codes where code = c)
         and not exists (select 1 from product_variants where sku = c) then
        insert into product_codes (code, variant_id) values (c, v_id);
        n_codes := n_codes + 1;
      elsif not exists (select 1 from product_codes where code = c and variant_id = v_id) then
        n_code_skip := n_code_skip + 1;
      end if;
    end loop;

    -- images (only for products that don't already have website photos)
    if not exists (select 1 from product_images where product_id = p_id and shopify_image_id is not null) then
      for u in select jsonb_array_elements_text(coalesce(r->'images', '[]'::jsonb)) loop
        if u ~ '^https://' then
          insert into product_images (product_id, url, position)
          values (p_id, u, (select coalesce(max(position), 0) + 1 from product_images where product_id = p_id))
          on conflict (product_id, url) do nothing;
          if found then n_img := n_img + 1; end if;
        end if;
      end loop;
      update product_variants set image_url = coalesce(image_url, r->'images'->>0) where id = v_id;
    end if;
  end loop;

  return jsonb_build_object('products_created', n_new_p, 'variants_created', n_new_v, 'updated', n_upd,
                            'matched_website', n_web, 'codes_added', n_codes, 'codes_skipped', n_code_skip, 'images', n_img,
                            'ambiguous_skipped', n_amb);
end;
$$;

revoke all on function public.import_products(jsonb, text) from public, anon, authenticated;
grant execute on function public.import_products(jsonb, text) to service_role;
