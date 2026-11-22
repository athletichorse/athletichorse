-- =====================================================================
-- 0026_sales_points.sql — "sales point": a selling place that is not a branch
-- (e.g. Bulky, a sports event stand). Like a branch it has its own stock
-- (stock is transferred to it), its own till and shifts, and its own sales
-- and invoice numbers (from its code). Adds the two points the owner asked for.
-- Only widens the allowed kinds. Safe to run more than once.
-- =====================================================================

alter table public.locations drop constraint if exists locations_kind_check;
alter table public.locations add constraint locations_kind_check check (kind in ('branch', 'warehouse', 'sub_store', 'sales_point'));

insert into public.locations (code, name_ar, name_en, kind, uses_pos, address_ar, address_en) values
  ('SP01', 'بلكي', 'Bulky', 'sales_point', true, '', ''),
  ('SP02', 'فعالية رياضية (عبدالله)', 'Sports event (Abdallah)', 'sales_point', true, '', '')
on conflict (code) do nothing;
