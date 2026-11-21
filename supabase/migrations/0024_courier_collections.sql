-- =====================================================================
-- 0024_courier_collections.sql — money the shipping companies pay for
-- cash-on-delivery orders, checked order by order.
--   courier_collections       one payment (statement) from a shipping company
--   courier_collection_lines  the orders it pays for (each order is collected once)
--   post_collection(p)        saves a collection and marks its orders collected, in one go
-- Only adds: safe to run more than once.
-- =====================================================================

create table if not exists public.courier_collections (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null unique,                    -- same id twice → saved once
  courier     text not null check (length(courier) between 1 and 60),
  ref         text not null default '' check (length(ref) <= 60),   -- statement no.
  received_on date not null default ((now() at time zone 'Asia/Riyadh')::date),
  method      text not null default 'bank' check (method in ('bank', 'cash')),
  received    numeric(12,2) not null default 0,         -- money received (after fees)
  fees        numeric(12,2) not null default 0,         -- fees the company kept
  notes       text not null default '' check (length(notes) <= 500),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists courier_collections_on_idx on public.courier_collections (received_on desc);

create table if not exists public.courier_collection_lines (
  collection_id uuid not null references public.courier_collections(id) on delete cascade,
  order_id      uuid not null unique references public.web_orders(id) on delete cascade,
  expected      numeric(12,2) not null default 0,       -- amount to collect on the order
  collected     numeric(12,2) not null default 0,       -- amount the company says it collected
  fee           numeric(12,2) not null default 0,
  primary key (collection_id, order_id)
);

create or replace function public.post_collection(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; l jsonb; n int := 0; t_coll numeric(12,2) := 0; t_fee numeric(12,2) := 0;
begin
  select id into v_id from courier_collections where client_id = (p->>'client_id')::uuid;
  if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  if jsonb_array_length(coalesce(p->'lines', '[]'::jsonb)) = 0 then raise exception 'Choose at least one order'; end if;
  for l in select * from jsonb_array_elements(p->'lines') loop
    if exists (select 1 from courier_collection_lines where order_id = (l->>'order_id')::uuid) then
      raise exception 'Order % is already collected', (select name from web_orders where id = (l->>'order_id')::uuid);
    end if;
    t_coll := t_coll + coalesce((l->>'collected')::numeric, 0);
    t_fee  := t_fee  + coalesce((l->>'fee')::numeric, 0);
  end loop;
  insert into courier_collections (client_id, courier, ref, received_on, method, received, fees, notes, created_by)
  values ((p->>'client_id')::uuid, p->>'courier', coalesce(p->>'ref', ''), coalesce(nullif(p->>'received_on', '')::date, (now() at time zone 'Asia/Riyadh')::date),
          coalesce(nullif(p->>'method', ''), 'bank'), t_coll - t_fee, t_fee, coalesce(p->>'notes', ''), nullif(p->>'user_id', '')::uuid)
  returning id into v_id;
  for l in select * from jsonb_array_elements(p->'lines') loop
    insert into courier_collection_lines (collection_id, order_id, expected, collected, fee)
    values (v_id, (l->>'order_id')::uuid, coalesce((l->>'expected')::numeric, 0), coalesce((l->>'collected')::numeric, 0), coalesce((l->>'fee')::numeric, 0));
    insert into web_order_follow (order_id, status, courier, updated_by, updated_at)
    values ((l->>'order_id')::uuid, 'collected', p->>'courier', nullif(p->>'user_id', '')::uuid, now())
    on conflict (order_id) do update set status = 'collected', courier = coalesce(web_order_follow.courier, excluded.courier),
      updated_by = excluded.updated_by, updated_at = now();
    n := n + 1;
  end loop;
  return jsonb_build_object('id', v_id, 'orders', n, 'received', t_coll - t_fee, 'fees', t_fee, 'duplicate', false);
end;
$$;

alter table public.courier_collections enable row level security;
alter table public.courier_collection_lines enable row level security;
revoke all on public.courier_collections, public.courier_collection_lines from anon, authenticated;
grant all on public.courier_collections, public.courier_collection_lines to service_role;
revoke all on function public.post_collection(jsonb) from public, anon, authenticated;
grant execute on function public.post_collection(jsonb) to service_role;
