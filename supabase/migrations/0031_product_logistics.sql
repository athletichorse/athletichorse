-- =====================================================================
-- 0031_product_logistics.sql — for storing and buying each product:
--   bin_location      where it sits in the store (shelf / bin, free text)
--   units_per_carton  pieces in one carton
--   carton_cbm        size of one carton in cubic metres (CBM)
--   china_price       price at the factory in China, per piece, in china_currency
-- Purchase orders use them for cartons, total CBM and container fill.
-- Only adds. Safe to run more than once.
-- =====================================================================
alter table public.products add column if not exists bin_location text check (bin_location is null or length(bin_location) <= 60);
alter table public.products add column if not exists units_per_carton int check (units_per_carton is null or units_per_carton between 1 and 100000);
alter table public.products add column if not exists carton_cbm numeric(10,4) check (carton_cbm is null or (carton_cbm > 0 and carton_cbm < 100));
alter table public.products add column if not exists china_price numeric(12,2) check (china_price is null or china_price >= 0);
alter table public.products add column if not exists china_currency text not null default 'CNY' check (china_currency ~ '^[A-Z]{3}$');
