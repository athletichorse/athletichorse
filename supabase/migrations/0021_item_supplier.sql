-- =====================================================================
-- 0021_item_supplier.sql — supplier name and factory name on each item.
-- Typed on the item (or in the prices file); the lists offer names already used.
-- The item finder can search both. Only adds: safe to run more than once.
-- =====================================================================

alter table public.products add column if not exists supplier_name text check (supplier_name is null or length(supplier_name) <= 120);
alter table public.products add column if not exists factory_name  text check (factory_name is null or length(factory_name) <= 120);
create index if not exists products_supplier_idx on public.products (lower(supplier_name)) where supplier_name is not null;

-- item finder: two more text columns (supplier, factory)
create or replace function public.pos_item_finder(p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_loc uuid := nullif(p->>'location_id', '')::uuid;
  v_ar boolean := coalesce(p->>'locale', 'en') = 'ar';
  v_limit int := least(greatest(coalesce((p->>'limit')::int, 100), 1), 200);
  f jsonb; v_col text; v_op text; v_val text; v_pat text; v_expr text;
  v_where text := 'v.active and pr.active';
  v_total bigint; v_rows jsonb;
begin
  if not coalesce((p->>'show_no_stock')::boolean, false) and v_loc is not null then
    v_where := v_where || ' and (pr.is_service or coalesce(sl.qty, 0) > 0)';
  end if;

  for f in select * from jsonb_array_elements(coalesce(p->'filters', '[]'::jsonb)) loop
    v_col := f->>'col'; v_op := f->>'op'; v_val := btrim(coalesce(f->>'v', ''));
    continue when v_val = '' or length(v_val) > 80;

    if v_col in ('code', 'name', 'options', 'group', 'supplier', 'factory') then
      -- like-pattern with the person's text taken literally
      v_pat := replace(replace(replace(v_val, '\', '\\'), '%', '\%'), '_', '\_');
      v_pat := case v_op when 'starts' then v_pat || '%' when 'ends' then '%' || v_pat when 'eq' then v_pat else '%' || v_pat || '%' end;
      v_expr := case v_col
        when 'code'    then format('(v.sku ilike %1$L or exists (select 1 from product_codes c where c.variant_id = v.id and c.code ilike %1$L))', v_pat)
        when 'name'    then format('(pr.name_en ilike %1$L or pr.name_ar ilike %1$L)', v_pat)
        when 'options' then format('(concat_ws('' / '', v.option1, v.option2, v.option3) ilike %1$L or v.option1 ilike %1$L or v.option2 ilike %1$L or v.option3 ilike %1$L)', v_pat)
        when 'supplier' then format('pr.supplier_name ilike %1$L', v_pat)
        when 'factory'  then format('pr.factory_name ilike %1$L', v_pat)
        else format('(g.name_en ilike %1$L or g.name_ar ilike %1$L)', v_pat)
      end;
    elsif v_col in ('price', 'cost', 'stock') then
      continue when v_val !~ '^-?[0-9]{1,9}(\.[0-9]{1,3})?$';
      v_expr := case v_col
        when 'price' then 'price_now(v.price, v.sale_price, v.sale_from, v.sale_to)'
        when 'cost'  then 'v.cost'
        else 'coalesce(sl.qty, 0)'
      end || case v_op when 'gt' then ' > ' when 'gte' then ' >= ' when 'lt' then ' < ' when 'lte' then ' <= ' else ' = ' end || format('%L::numeric', v_val);
    else
      continue;
    end if;
    v_where := v_where || ' and ' || v_expr;
  end loop;

  execute format($q$
    with m as (
      select v.id, v.sku, v.option1, v.option2, v.option3, v.cost, pr.is_service,
             pr.name_en, pr.name_ar, g.name_en as g_en, g.name_ar as g_ar, pr.supplier_name, pr.factory_name,
             price_now(v.price, v.sale_price, v.sale_from, v.sale_to)::numeric(12,2) as price,
             sl.qty
        from product_variants v
        join products pr on pr.id = v.product_id
        left join product_groups g on g.id = pr.group_id
        left join stock_levels sl on sl.variant_id = v.id and sl.location_id = %1$L::uuid
       where %2$s)
    select (select count(*) from m),
           coalesce((select jsonb_agg(jsonb_build_object(
              'variant_id', id, 'sku', sku, 'name_en', name_en, 'name_ar', name_ar,
              'options', concat_ws(' / ', option1, option2, option3), 'group_en', g_en, 'group_ar', g_ar,
              'price', price, 'cost', cost, 'stock', qty, 'is_service', is_service,
              'supplier', supplier_name, 'factory', factory_name))
             from (select * from m order by %3$s, sku limit %4$s) x), '[]'::jsonb)
  $q$, v_loc, v_where, case when v_ar then 'coalesce(nullif(name_ar, ''''), name_en)' else 'name_en' end, v_limit)
  into v_total, v_rows;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

revoke all on function public.pos_item_finder(jsonb) from public, anon, authenticated;
grant execute on function public.pos_item_finder(jsonb) to service_role;
