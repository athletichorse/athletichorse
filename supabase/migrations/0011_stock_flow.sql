-- =====================================================================
-- 0011_stock_flow.sql — stock documents with lines and prices, transfers
-- in transit, write-off reasons, restock requests, shortages.
--  * Transfers: sent (stock leaves the sender, status in_transit) → received
--    (each line's arrived quantity enters the receiver; shortages and extras
--    are kept on the line).
--  * Every document keeps its lines with the item price at that moment and,
--    for counts, the system stock before the count.
--  * Restock requests from any store, converted into a transfer by the sender.
-- Safe to run more than once.
-- =====================================================================

alter table public.stock_docs add column if not exists status text not null default 'done';
alter table public.stock_docs add column if not exists reason text;
alter table public.stock_docs add column if not exists received_at timestamptz;
alter table public.stock_docs add column if not exists received_by uuid references public.profiles(id) on delete set null;
alter table public.stock_docs add column if not exists request_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stock_docs_status_check') then
    alter table public.stock_docs add constraint stock_docs_status_check check (status in ('done', 'in_transit', 'received'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_docs_reason_check') then
    alter table public.stock_docs add constraint stock_docs_reason_check check (reason is null or reason in ('damaged', 'lost', 'waste', 'expired', 'other'));
  end if;
end $$;
create index if not exists stock_docs_transit_idx on public.stock_docs(to_location_id) where status = 'in_transit';

create table if not exists public.stock_doc_lines (
  doc_id        uuid not null references public.stock_docs(id) on delete restrict,
  line_no       integer not null,
  variant_id    uuid not null references public.product_variants(id),
  qty           numeric(12,3) not null,          -- sent / received / written off / counted
  system_qty    numeric(12,3),                   -- counts: stock before the count
  received_qty  numeric(12,3),                   -- transfers: what arrived
  unit_price    numeric(12,2) not null default 0,-- VAT-inclusive price at that moment
  primary key (doc_id, line_no)
);
alter table public.stock_doc_lines enable row level security;
revoke all on public.stock_doc_lines from anon, authenticated;

-- ---------------------------------------------------------------------
-- post_stock_doc2(p jsonb): every stock document from the screens.
-- p: {client_id, kind, location_id, to_location_id, lines:[{variant_id, qty}], note, reason, user_id, approved_by, request_id}
--  kind 'transfer' → sent, in transit (stock leaves the sender only).
-- Idempotent by client_id.
-- ---------------------------------------------------------------------
create or replace function public.post_stock_doc2(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc uuid; v_no bigint; l jsonb; v uuid; v_qty numeric(12,3); v_cur numeric(12,3); n int := 0;
  v_kind text := p->>'kind'; v_loc uuid := (p->>'location_id')::uuid; v_to uuid := nullif(p->>'to_location_id', '')::uuid;
  v_user uuid := nullif(p->>'user_id', '')::uuid; v_reason text := nullif(p->>'reason', '');
begin
  select id, doc_no into v_doc, v_no from stock_docs where client_id = (p->>'client_id')::uuid;
  if found then return jsonb_build_object('doc_id', v_doc, 'doc_no', v_no, 'duplicate', true); end if;
  if v_kind not in ('receipt', 'transfer', 'write_off', 'count', 'adjust') then raise exception 'Unknown stock document kind %', v_kind; end if;
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then raise exception 'A stock document needs at least one line'; end if;
  if v_kind = 'write_off' and v_reason is null then raise exception 'reason_required'; end if;
  if v_kind = 'transfer' and (v_to is null or v_to = v_loc) then raise exception 'bad_target'; end if;

  insert into stock_docs (client_id, kind, location_id, to_location_id, note, reason, status, created_by, approved_by, request_id)
  values ((p->>'client_id')::uuid, v_kind, v_loc, case when v_kind = 'transfer' then v_to end, coalesce(p->>'note', ''),
          case when v_kind = 'write_off' then v_reason end, case when v_kind = 'transfer' then 'in_transit' else 'done' end,
          v_user, nullif(p->>'approved_by', '')::uuid, nullif(p->>'request_id', '')::uuid)
  returning id, doc_no into v_doc, v_no;

  for l in select * from jsonb_array_elements(p->'lines') loop
    v := (l->>'variant_id')::uuid;
    v_qty := (l->>'qty')::numeric(12,3);
    if not exists (select 1 from product_variants pv join products pr on pr.id = pv.product_id where pv.id = v and not pr.is_service) then
      raise exception 'Item % does not exist or is a service (no stock)', v;
    end if;
    v_cur := coalesce((select qty from stock_levels where location_id = v_loc and variant_id = v), 0);
    n := n + 1;
    insert into stock_doc_lines (doc_id, line_no, variant_id, qty, system_qty, unit_price)
    values (v_doc, n, v, v_qty, case when v_kind = 'count' then v_cur end,
            coalesce((select price from variant_search where variant_id = v), 0));
    if v_kind = 'count' then
      if v_qty < 0 then raise exception 'Counted quantity cannot be negative'; end if;
      if v_qty <> v_cur then perform apply_stock_change(v_loc, v, v_qty - v_cur, 'count', v_doc, v_user); end if;
    elsif v_kind = 'adjust' then
      if v_qty = 0 then raise exception 'Adjustment cannot be zero'; end if;
      perform apply_stock_change(v_loc, v, v_qty, 'adjust', v_doc, v_user);
    else
      if v_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
      if v_kind = 'receipt' then perform apply_stock_change(v_loc, v, v_qty, 'receipt', v_doc, v_user);
      elsif v_kind = 'write_off' then perform apply_stock_change(v_loc, v, -v_qty, 'write_off', v_doc, v_user);
      elsif v_kind = 'transfer' then perform apply_stock_change(v_loc, v, -v_qty, 'transfer_out', v_doc, v_user);
      end if;
    end if;
  end loop;

  update stock_docs set lines = n where id = v_doc;
  if nullif(p->>'request_id', '') is not null then
    update stock_requests set status = 'converted', transfer_doc_id = v_doc where id = (p->>'request_id')::uuid and status = 'open';
  end if;
  return jsonb_build_object('doc_id', v_doc, 'doc_no', v_no, 'duplicate', false, 'lines', n);
end;
$$;

-- ---------------------------------------------------------------------
-- receive_transfer: the receiving store confirms what arrived.
-- p_lines: [{line_no, received_qty}] (missing lines = nothing arrived).
-- Repeat calls return the first result.
-- ---------------------------------------------------------------------
create or replace function public.receive_transfer(p_doc uuid, p_lines jsonb, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare d record; l record; v_got numeric(12,3); short numeric(12,3) := 0; extra numeric(12,3) := 0;
begin
  select * into d from stock_docs where id = p_doc and kind = 'transfer' for update;
  if not found then raise exception 'Transfer not found'; end if;
  if d.status = 'received' then return jsonb_build_object('doc_no', d.doc_no, 'duplicate', true); end if;
  if d.status <> 'in_transit' then raise exception 'This transfer was already completed'; end if;
  for l in select * from stock_doc_lines where doc_id = p_doc order by line_no loop
    select coalesce((x->>'received_qty')::numeric(12,3), 0) into v_got
      from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) x where (x->>'line_no')::int = l.line_no;
    v_got := coalesce(v_got, 0);
    if v_got < 0 then raise exception 'Received quantity cannot be negative'; end if;
    update stock_doc_lines set received_qty = v_got where doc_id = p_doc and line_no = l.line_no;
    if v_got > 0 then perform apply_stock_change(d.to_location_id, l.variant_id, v_got, 'transfer_in', p_doc, p_user); end if;
    if v_got < l.qty then short := short + (l.qty - v_got); elsif v_got > l.qty then extra := extra + (v_got - l.qty); end if;
  end loop;
  update stock_docs set status = 'received', received_at = now(), received_by = p_user where id = p_doc;
  return jsonb_build_object('doc_no', d.doc_no, 'shortage', short, 'extra', extra, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------
-- Restock requests
-- ---------------------------------------------------------------------
create sequence if not exists public.stock_request_no_seq;
create table if not exists public.stock_requests (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null unique,
  request_no       bigint not null default nextval('public.stock_request_no_seq') unique,
  to_location_id   uuid not null references public.locations(id),      -- the store that needs the items
  from_location_id uuid references public.locations(id),               -- suggested sender (optional)
  status           text not null default 'open' check (status in ('open', 'converted', 'cancelled')),
  note             text not null default '',
  transfer_doc_id  uuid references public.stock_docs(id),
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);
create table if not exists public.stock_request_lines (
  request_id  uuid not null references public.stock_requests(id) on delete cascade,
  line_no     integer not null,
  variant_id  uuid not null references public.product_variants(id),
  qty         numeric(12,3) not null check (qty > 0),
  primary key (request_id, line_no)
);
alter table public.stock_requests enable row level security;
alter table public.stock_request_lines enable row level security;
revoke all on public.stock_requests, public.stock_request_lines from anon, authenticated;

create or replace function public.create_stock_request(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_no bigint; l jsonb; n int := 0;
begin
  select id, request_no into v_id, v_no from stock_requests where client_id = (p->>'client_id')::uuid;
  if found then return jsonb_build_object('request_id', v_id, 'request_no', v_no, 'duplicate', true); end if;
  if jsonb_array_length(coalesce(p->'lines', '[]'::jsonb)) = 0 then raise exception 'A request needs at least one item'; end if;
  insert into stock_requests (client_id, to_location_id, from_location_id, note, created_by)
  values ((p->>'client_id')::uuid, (p->>'to_location_id')::uuid, nullif(p->>'from_location_id', '')::uuid, coalesce(p->>'note', ''), nullif(p->>'user_id', '')::uuid)
  returning id, request_no into v_id, v_no;
  for l in select * from jsonb_array_elements(p->'lines') loop
    n := n + 1;
    insert into stock_request_lines (request_id, line_no, variant_id, qty) values (v_id, n, (l->>'variant_id')::uuid, (l->>'qty')::numeric);
  end loop;
  return jsonb_build_object('request_id', v_id, 'request_no', v_no, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------
-- Lists
-- ---------------------------------------------------------------------
create or replace view public.stock_doc_list with (security_invoker = true) as
select d.id, d.doc_no, d.kind, d.status, d.reason, d.location_id, d.to_location_id, d.note, d.lines, d.created_at, d.received_at,
       d.created_by, u.full_name as created_by_name, r.full_name as received_by_name,
       (select coalesce(sum(l.qty * l.unit_price), 0) from public.stock_doc_lines l where l.doc_id = d.id)::numeric(12,2) as value,
       (select coalesce(sum(l.qty), 0) from public.stock_doc_lines l where l.doc_id = d.id) as total_qty
  from public.stock_docs d
  left join public.profiles u on u.id = d.created_by
  left join public.profiles r on r.id = d.received_by;
revoke all on public.stock_doc_list from anon, authenticated;

-- Stock per item and location with price and reorder level (shortages report).
create or replace view public.stock_shortage_list with (security_invoker = true) as
select l.id as location_id, v.id as variant_id, p.id as product_id, p.name_en, p.name_ar, v.sku, v.option1, v.option2, v.option3,
       public.price_now(v.price, v.sale_price, v.sale_from, v.sale_to)::numeric(12,2) as price,
       coalesce(sl.qty, 0) as qty, v.reorder_level,
       lower(p.name_en || ' ' || p.name_ar || ' ' || coalesce(v.sku, '') || ' ' || coalesce(v.option1, '') || ' ' || coalesce(v.option2, '')) as search
  from public.locations l
  cross join public.product_variants v
  join public.products p on p.id = v.product_id
  left join public.stock_levels sl on sl.location_id = l.id and sl.variant_id = v.id
 where l.active and v.active and p.active and not p.is_service;
revoke all on public.stock_shortage_list from anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array['post_stock_doc2(jsonb)', 'receive_transfer(uuid,jsonb,uuid)', 'create_stock_request(jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
