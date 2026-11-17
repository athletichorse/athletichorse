-- =====================================================================
-- 0020_price_levels.sql — several prices per item, one price level per customer.
--   price_levels         the levels (e.g. Wholesale, VIP). The level with code
--                        'wholesale' uses the existing product_variants.wholesale_price.
--   variant_level_prices the price of an item (variant) on every other level.
--   customer_details.price_level_id   the customer's level (empty = normal price).
-- At the till a customer on a level pays that level's price for items that have one;
-- other items keep the normal price. Only adds: safe to run more than once.
-- =====================================================================

create table if not exists public.price_levels (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[a-z0-9_]{1,30}$'),
  name_en    text not null check (length(name_en) between 1 and 60),
  name_ar    text not null default '' check (length(name_ar) <= 60),
  sort       int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.price_levels (code, name_en, name_ar, sort) values ('wholesale', 'Wholesale', 'الجملة', 1)
  on conflict (code) do nothing;

create table if not exists public.variant_level_prices (
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  level_id   uuid not null references public.price_levels(id) on delete cascade,
  price      numeric(12,2) not null check (price >= 0),
  updated_at timestamptz not null default now(),
  primary key (variant_id, level_id)
);
create index if not exists variant_level_prices_level_idx on public.variant_level_prices (level_id);

alter table public.customer_details add column if not exists price_level_id uuid references public.price_levels(id) on delete set null;

-- Every price of one level: [{variant_id, price}] (wholesale reads the wholesale column).
create or replace function public.level_prices(p_level uuid)
returns table (variant_id uuid, price numeric)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.wholesale_price from product_variants v
   where v.wholesale_price is not null and exists (select 1 from price_levels l where l.id = p_level and l.code = 'wholesale' and l.active)
  union all
  select lp.variant_id, lp.price from variant_level_prices lp join price_levels l on l.id = lp.level_id
   where lp.level_id = p_level and l.code <> 'wholesale' and l.active;
$$;

alter table public.price_levels enable row level security;
alter table public.variant_level_prices enable row level security;
revoke all on public.price_levels, public.variant_level_prices from anon, authenticated;
grant all on public.price_levels, public.variant_level_prices to service_role;
revoke all on function public.level_prices(uuid) from public, anon, authenticated;
grant execute on function public.level_prices(uuid) to service_role;
