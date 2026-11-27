-- =====================================================================
-- 0034_item_condition.sql — the condition of the stock of each item in each store:
--   sound (سليم) / damaged (تالف) / partial defect (عيب جزئي).
-- stock_condition keeps how many of the on-hand pieces are damaged / partly faulty;
-- sound = on hand − damaged − partial. Changing the condition does not change the
-- quantity. The owner then decides for the faulty pieces (settle_defect):
--   return to the supplier or scrap → they leave the store (write-off movement);
--   repair → they become sound again.
-- Only adds. Safe to run more than once.
-- =====================================================================

create table if not exists public.stock_condition (
  location_id  uuid not null references public.locations(id) on delete restrict,
  variant_id   uuid not null references public.product_variants(id) on delete restrict,
  damaged      numeric(12,3) not null default 0 check (damaged >= 0),
  partial      numeric(12,3) not null default 0 check (partial >= 0),
  updated_at   timestamptz not null default now(),
  primary key (location_id, variant_id)
);
alter table public.stock_condition enable row level security;

create table if not exists public.condition_changes (
  id           bigserial primary key,
  client_id    uuid not null unique,
  location_id  uuid not null references public.locations(id),
  variant_id   uuid not null references public.product_variants(id),
  from_cond    text not null check (from_cond in ('good', 'damaged', 'partial')),
  to_cond      text not null check (to_cond in ('good', 'damaged', 'partial')),
  qty          numeric(12,3) not null check (qty > 0),
  note         text not null default '',
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  check (from_cond <> to_cond)
);
create index if not exists condition_changes_at_idx on public.condition_changes (created_at desc);
alter table public.condition_changes enable row level security;

create table if not exists public.defect_actions (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null unique,
  location_id  uuid not null references public.locations(id),
  variant_id   uuid not null references public.product_variants(id),
  cond         text not null check (cond in ('damaged', 'partial')),
  action       text not null check (action in ('return_supplier', 'repair', 'scrap')),
  qty          numeric(12,3) not null check (qty > 0),
  supplier_id  uuid references public.suppliers(id),
  note         text not null default '',
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists defect_actions_at_idx on public.defect_actions (created_at desc);
alter table public.defect_actions enable row level security;

-- Move part (or all) of an item's stock in one store from one condition to another.
create or replace function public.change_item_condition(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loc uuid := (p->>'location_id')::uuid; v_var uuid := (p->>'variant_id')::uuid;
  v_from text := p->>'from_cond'; v_to text := p->>'to_cond'; v_qty numeric := (p->>'qty')::numeric;
  v_on numeric; v_dmg numeric; v_par numeric; v_avail numeric; v_id bigint;
begin
  select id into v_id from condition_changes where client_id = (p->>'client_id')::uuid;
  if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  if v_from not in ('good', 'damaged', 'partial') or v_to not in ('good', 'damaged', 'partial') or v_from = v_to then raise exception 'bad_condition'; end if;
  if v_qty is null or v_qty <= 0 then raise exception 'bad_qty'; end if;
  select coalesce((select qty from stock_levels where location_id = v_loc and variant_id = v_var), 0) into v_on;
  insert into stock_condition (location_id, variant_id) values (v_loc, v_var) on conflict do nothing;
  select damaged, partial into v_dmg, v_par from stock_condition where location_id = v_loc and variant_id = v_var for update;
  v_avail := case v_from when 'good' then greatest(0, v_on - v_dmg - v_par) when 'damaged' then v_dmg else v_par end;
  if v_qty > v_avail then raise exception 'not_enough'; end if;
  update stock_condition set
    damaged = damaged - case when v_from = 'damaged' then v_qty else 0 end + case when v_to = 'damaged' then v_qty else 0 end,
    partial = partial - case when v_from = 'partial' then v_qty else 0 end + case when v_to = 'partial' then v_qty else 0 end,
    updated_at = now()
   where location_id = v_loc and variant_id = v_var;
  insert into condition_changes (client_id, location_id, variant_id, from_cond, to_cond, qty, note, created_by)
  values ((p->>'client_id')::uuid, v_loc, v_var, v_from, v_to, v_qty, left(coalesce(p->>'note', ''), 300), nullif(p->>'user_id', '')::uuid)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'duplicate', false);
end;
$$;
revoke all on function public.change_item_condition(jsonb) from public, anon, authenticated;
grant execute on function public.change_item_condition(jsonb) to service_role;

-- The owner's decision for faulty pieces: return to supplier / scrap (out of the store) or repair (sound again).
create or replace function public.settle_defect(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loc uuid := (p->>'location_id')::uuid; v_var uuid := (p->>'variant_id')::uuid;
  v_cond text := p->>'cond'; v_act text := p->>'action'; v_qty numeric := (p->>'qty')::numeric;
  v_sup uuid := nullif(p->>'supplier_id', '')::uuid; v_have numeric; v_id uuid;
begin
  select id into v_id from defect_actions where client_id = (p->>'client_id')::uuid;
  if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  if v_cond not in ('damaged', 'partial') then raise exception 'bad_condition'; end if;
  if v_act not in ('return_supplier', 'repair', 'scrap') then raise exception 'bad_action'; end if;
  if v_qty is null or v_qty <= 0 then raise exception 'bad_qty'; end if;
  if v_sup is not null and not exists (select 1 from suppliers where id = v_sup) then raise exception 'bad_supplier'; end if;
  select case v_cond when 'damaged' then damaged else partial end into v_have from stock_condition where location_id = v_loc and variant_id = v_var for update;
  if v_have is null or v_qty > v_have then raise exception 'not_enough'; end if;
  insert into defect_actions (client_id, location_id, variant_id, cond, action, qty, supplier_id, note, created_by)
  values ((p->>'client_id')::uuid, v_loc, v_var, v_cond, v_act, v_qty, case when v_act = 'return_supplier' then v_sup end, left(coalesce(p->>'note', ''), 300), nullif(p->>'user_id', '')::uuid)
  returning id into v_id;
  update stock_condition set
    damaged = damaged - case when v_cond = 'damaged' then v_qty else 0 end,
    partial = partial - case when v_cond = 'partial' then v_qty else 0 end,
    updated_at = now()
   where location_id = v_loc and variant_id = v_var;
  if v_act <> 'repair' then
    perform apply_stock_change(v_loc, v_var, -v_qty, 'write_off', null, nullif(p->>'user_id', '')::uuid, 'defect_' || v_act, v_id);
  end if;
  return jsonb_build_object('id', v_id, 'duplicate', false);
end;
$$;
revoke all on function public.settle_defect(jsonb) from public, anon, authenticated;
grant execute on function public.settle_defect(jsonb) to service_role;
