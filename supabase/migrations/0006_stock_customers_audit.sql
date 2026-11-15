-- =====================================================================
-- 0006_stock_customers_audit.sql
--  * Stock: stock_levels + append-only stock_movements + stock_docs.
--    Stock changes ONLY through post_stock_doc() — one transaction,
--    idempotent by a client-generated client_id (a retried request never
--    applies twice).
--  * Customers with a serial customer number and a required mobile.
--  * Audit log.
-- Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------
create table if not exists public.stock_levels (
  location_id  uuid not null references public.locations(id) on delete restrict,
  variant_id   uuid not null references public.product_variants(id) on delete restrict,
  qty          numeric(12,3) not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (location_id, variant_id)
);
create index if not exists stock_levels_variant_idx on public.stock_levels(variant_id);

create sequence if not exists public.stock_doc_no_seq;

-- One row per stock document (receipt, transfer, write-off, count, adjustment, opening).
create table if not exists public.stock_docs (
  id              uuid primary key default gen_random_uuid(),
  doc_no          bigint not null default nextval('public.stock_doc_no_seq') unique,
  client_id       uuid not null unique,              -- idempotency key from the device
  kind            text not null check (kind in ('receipt','transfer','write_off','count','adjust','opening')),
  location_id     uuid not null references public.locations(id),
  to_location_id  uuid references public.locations(id),
  note            text not null default '',
  lines           integer not null default 0,
  created_by      uuid references public.profiles(id) on delete set null,
  approved_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint stock_docs_transfer_target check ((kind = 'transfer') = (to_location_id is not null)),
  constraint stock_docs_transfer_distinct check (to_location_id is null or to_location_id <> location_id)
);
create index if not exists stock_docs_created_idx on public.stock_docs(created_at desc);

-- Append-only log of every stock change.
create table if not exists public.stock_movements (
  id           bigserial primary key,
  doc_id       uuid references public.stock_docs(id) on delete restrict,
  kind         text not null check (kind in ('receipt','transfer_out','transfer_in','write_off','count','adjust','opening','sale','return')),
  location_id  uuid not null references public.locations(id),
  variant_id   uuid not null references public.product_variants(id),
  qty_change   numeric(12,3) not null,
  qty_after    numeric(12,3) not null,
  ref_type     text,                 -- e.g. 'invoice' for sales (POS)
  ref_id       uuid,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists stock_movements_loc_idx on public.stock_movements(location_id, created_at desc);
create index if not exists stock_movements_variant_idx on public.stock_movements(variant_id, created_at desc);

create or replace function public.stock_movements_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'stock_movements is append-only';
end;
$$;
drop trigger if exists stock_movements_no_change on public.stock_movements;
create trigger stock_movements_no_change before update or delete on public.stock_movements
  for each row execute function public.stock_movements_append_only();

-- Applies one change to one item at one location; returns the new quantity. Internal.
create or replace function public.apply_stock_change(
  p_location uuid, p_variant uuid, p_change numeric, p_kind text,
  p_doc uuid, p_user uuid, p_ref_type text default null, p_ref_id uuid default null)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare v_after numeric(12,3);
begin
  insert into stock_levels (location_id, variant_id, qty, updated_at)
  values (p_location, p_variant, p_change, now())
  on conflict (location_id, variant_id) do update set qty = stock_levels.qty + excluded.qty, updated_at = now()
  returning qty into v_after;
  insert into stock_movements (doc_id, kind, location_id, variant_id, qty_change, qty_after, ref_type, ref_id, created_by)
  values (p_doc, p_kind, p_location, p_variant, p_change, v_after, p_ref_type, p_ref_id, p_user);
  return v_after;
end;
$$;

-- ---------------------------------------------------------------------------
-- post_stock_doc: the ONLY way stock documents change stock.
--  p_lines: [{variant_id, qty}]   qty > 0 (for 'count': the counted quantity, ≥ 0;
--                                  for 'adjust': signed change, ≠ 0)
--  Idempotent by p_client_id: a second call with the same id returns the first result.
-- ---------------------------------------------------------------------------
create or replace function public.post_stock_doc(
  p_client_id uuid, p_kind text, p_location uuid, p_to_location uuid,
  p_lines jsonb, p_note text, p_user uuid, p_approved_by uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc uuid; v_no bigint; l jsonb; v uuid; v_qty numeric(12,3); v_cur numeric(12,3); n int := 0;
begin
  select id, doc_no into v_doc, v_no from stock_docs where client_id = p_client_id;
  if found then
    return jsonb_build_object('doc_id', v_doc, 'doc_no', v_no, 'duplicate', true);
  end if;

  if p_kind not in ('receipt','transfer','write_off','count','adjust','opening') then
    raise exception 'Unknown stock document kind %', p_kind;
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A stock document needs at least one line';
  end if;

  insert into stock_docs (client_id, kind, location_id, to_location_id, note, created_by, approved_by)
  values (p_client_id, p_kind, p_location, case when p_kind = 'transfer' then p_to_location end,
          coalesce(p_note, ''), p_user, p_approved_by)
  returning id, doc_no into v_doc, v_no;

  for l in select * from jsonb_array_elements(p_lines) loop
    v := (l->>'variant_id')::uuid;
    v_qty := (l->>'qty')::numeric(12,3);
    if not exists (select 1 from product_variants pv join products p on p.id = pv.product_id where pv.id = v and not p.is_service) then
      raise exception 'Item % does not exist or is a service (no stock)', v;
    end if;
    if p_kind = 'count' then
      if v_qty < 0 then raise exception 'Counted quantity cannot be negative'; end if;
      select coalesce((select qty from stock_levels where location_id = p_location and variant_id = v), 0) into v_cur;
      if v_qty <> v_cur then perform apply_stock_change(p_location, v, v_qty - v_cur, 'count', v_doc, p_user); end if;
    elsif p_kind = 'adjust' then
      if v_qty = 0 then raise exception 'Adjustment cannot be zero'; end if;
      perform apply_stock_change(p_location, v, v_qty, 'adjust', v_doc, p_user);
    else
      if v_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
      if p_kind = 'receipt' then
        perform apply_stock_change(p_location, v, v_qty, 'receipt', v_doc, p_user);
      elsif p_kind = 'opening' then
        perform apply_stock_change(p_location, v, v_qty, 'opening', v_doc, p_user);
      elsif p_kind = 'write_off' then
        perform apply_stock_change(p_location, v, -v_qty, 'write_off', v_doc, p_user);
      elsif p_kind = 'transfer' then
        perform apply_stock_change(p_location, v, -v_qty, 'transfer_out', v_doc, p_user);
        perform apply_stock_change(p_to_location, v, v_qty, 'transfer_in', v_doc, p_user);
      end if;
    end if;
    n := n + 1;
  end loop;

  update stock_docs set lines = n where id = v_doc;
  return jsonb_build_object('doc_id', v_doc, 'doc_no', v_no, 'duplicate', false, 'lines', n);
end;
$$;

revoke all on function public.apply_stock_change(uuid, uuid, numeric, text, uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.post_stock_doc(uuid, text, uuid, uuid, jsonb, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.post_stock_doc(uuid, text, uuid, uuid, jsonb, text, uuid, uuid) to service_role;
grant execute on function public.apply_stock_change(uuid, uuid, numeric, text, uuid, uuid, text, uuid) to service_role;

-- Stock per item and location, for the Stores screen.
create or replace view public.stock_list with (security_invoker = true) as
select sl.location_id, sl.variant_id, sl.qty, sl.updated_at,
       p.id as product_id, p.name_en, p.name_ar, v.sku, v.option1, v.option2, v.option3, v.price,
       lower(p.name_en || ' ' || p.name_ar || ' ' || coalesce(v.sku, '') || ' ' || coalesce(v.option1, '')) as search
  from public.stock_levels sl
  join public.product_variants v on v.id = sl.variant_id
  join public.products p on p.id = v.product_id;
revoke all on public.stock_list from anon, authenticated;

-- Stock log screen: one row per movement with readable names.
create or replace view public.stock_movement_list with (security_invoker = true) as
select m.id, m.created_at, m.kind, m.qty_change, m.qty_after, m.location_id, m.variant_id, m.ref_type, m.ref_id,
       l.code as location_code, l.name_en as location_en, l.name_ar as location_ar,
       p.id as product_id, p.name_en, p.name_ar, v.sku, v.option1, v.option2,
       d.doc_no, d.note, u.full_name as user_name,
       lower(p.name_en || ' ' || p.name_ar || ' ' || coalesce(v.sku, '')) as search
  from public.stock_movements m
  join public.locations l on l.id = m.location_id
  join public.product_variants v on v.id = m.variant_id
  join public.products p on p.id = v.product_id
  left join public.stock_docs d on d.id = m.doc_id
  left join public.profiles u on u.id = m.created_by;
revoke all on public.stock_movement_list from anon, authenticated;

-- Item search for stock / POS screens (SKU, extra code or name).
create or replace view public.variant_search with (security_invoker = true) as
select v.id as variant_id, v.sku, v.price, v.option1, v.option2, v.option3, v.active, v.image_url,
       p.id as product_id, p.name_en, p.name_ar, p.is_service, p.active as product_active,
       lower(p.name_en || ' ' || p.name_ar || ' ' || coalesce(v.sku, '') || ' ' || coalesce(v.shopify_sku, '') || ' ' ||
             coalesce(v.option1, '') || ' ' || coalesce(v.option2, '') || ' ' ||
             coalesce((select string_agg(c.code, ' ') from public.product_codes c where c.variant_id = v.id), '')) as search
  from public.product_variants v
  join public.products p on p.id = v.product_id;
revoke all on public.variant_search from anon, authenticated;

-- ---------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------
create sequence if not exists public.customer_no_seq;
create table if not exists public.customers (
  id           uuid primary key default gen_random_uuid(),
  customer_no  bigint not null default nextval('public.customer_no_seq') unique,
  phone        text not null unique check (phone ~ '^\+9665[0-9]{8}$'),
  name         text not null default '',
  email        text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  vat_number   text check (vat_number is null or vat_number ~ '^3[0-9]{13}3$'),   -- B2B customers
  notes        text not null default '',
  active       boolean not null default true,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
drop trigger if exists customers_touch on public.customers;
create trigger customers_touch before update on public.customers
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  user_id     uuid references public.profiles(id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   text,
  details     jsonb not null default '{}'
);
create index if not exists audit_log_at_idx on public.audit_log(at desc);
drop trigger if exists audit_log_no_change on public.audit_log;
create trigger audit_log_no_change before update or delete on public.audit_log
  for each row execute function public.stock_movements_append_only();

-- ---------------------------------------------------------------------
-- Security: RLS on, no policies.
-- ---------------------------------------------------------------------
alter table public.stock_levels    enable row level security;
alter table public.stock_docs      enable row level security;
alter table public.stock_movements enable row level security;
alter table public.customers       enable row level security;
alter table public.audit_log       enable row level security;
revoke all on public.stock_levels, public.stock_docs, public.stock_movements, public.customers, public.audit_log
  from anon, authenticated;
