-- =====================================================================
-- 0023_order_follow_up.sql — following up website orders until the money is in.
--   web_orders.province / address      shipping region and street (from the website)
--   web_order_follow                   one row per order: status, shipping company and
--                                      waybill no., normal/bulky, branch in charge, notes
-- Only adds: safe to run more than once.
-- =====================================================================

alter table public.web_orders add column if not exists province text not null default '';
alter table public.web_orders add column if not exists address  text not null default '';

create table if not exists public.web_order_follow (
  order_id   uuid primary key references public.web_orders(id) on delete cascade,
  status     text not null default 'new'
             check (status in ('new', 'confirmed', 'shipped', 'delivered', 'collected', 'returned', 'cancelled')),
  courier    text check (courier is null or length(courier) <= 60),
  waybill    text check (waybill is null or length(waybill) <= 60),
  size       text not null default 'normal' check (size in ('normal', 'bulky')),
  branch_id  uuid references public.locations(id) on delete set null,
  notes      text not null default '' check (length(notes) <= 500),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists web_order_follow_status_idx on public.web_order_follow (status);
create index if not exists web_order_follow_waybill_idx on public.web_order_follow (lower(waybill)) where waybill is not null;

alter table public.web_order_follow enable row level security;
revoke all on public.web_order_follow from anon, authenticated;
grant all on public.web_order_follow to service_role;
