-- =====================================================================
-- 0018_customer_business_details.sql — business customers (B2B):
-- commercial registration no. and the Saudi national address
-- (building no., street, district, city, country, postal code, additional no.).
-- Shown on the customer's tax invoice.
-- Kept in its own table (one row per customer) so the customers table and the
-- customer_list view (built on customers.*) stay exactly as they are.
-- Only adds: safe to run more than once.
-- =====================================================================

create table if not exists public.customer_details (
  customer_id     uuid primary key references public.customers(id) on delete cascade,
  cr_number       text check (cr_number is null or cr_number ~ '^[0-9]{10}$'),
  addr_building   text check (addr_building is null or addr_building ~ '^[0-9]{4}$'),
  addr_street     text check (addr_street is null or length(addr_street) <= 120),
  addr_district   text check (addr_district is null or length(addr_district) <= 120),
  addr_city       text check (addr_city is null or length(addr_city) <= 80),
  addr_country    text check (addr_country is null or length(addr_country) <= 80),
  addr_postal     text check (addr_postal is null or addr_postal ~ '^[0-9]{5}$'),
  addr_additional text check (addr_additional is null or addr_additional ~ '^[0-9]{4}$'),
  updated_at      timestamptz not null default now()
);
alter table public.customer_details enable row level security;
revoke all on public.customer_details from anon, authenticated;
grant all on public.customer_details to service_role;
