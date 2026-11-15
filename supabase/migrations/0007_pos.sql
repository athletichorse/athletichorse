-- =====================================================================
-- 0007_pos.sql — Cashier (POS): shifts, quotations, invoices (ZATCA
-- simplified tax invoices), credit notes (returns), payments, cash in/out.
--  * All amounts are recomputed HERE from unit price × qty − discount with the
--    VAT rate from settings; totals = sum of rounded lines. Never from the browser.
--  * Every write is one transaction and idempotent by the device's client_id.
--  * Invoice numbers are sequential per branch and never reused (counter row
--    locked inside the transaction; a failed sale rolls the number back).
--  * Phase 2 ready: invoice UUID, ICV, previous-invoice hash + own hash,
--    einvoice_status / einvoice_xml columns.
-- Safe to run more than once.
-- =====================================================================

-- Fix the search_path warnings reported by the Supabase security advisor.
alter function public.touch_updated_at() set search_path = public;
alter function public.check_code_unique() set search_path = public;
alter function public.stock_movements_append_only() set search_path = public;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.pos_shifts (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null unique,
  location_id    uuid not null references public.locations(id),
  opened_by      uuid not null references public.profiles(id),
  opened_at      timestamptz not null default now(),
  opening_cash   numeric(12,2) not null default 0 check (opening_cash >= 0),
  status         text not null default 'open' check (status in ('open', 'closed')),
  closed_by      uuid references public.profiles(id),
  closed_at      timestamptz,
  expected_cash  numeric(12,2),
  counted_cash   numeric(12,2),
  difference     numeric(12,2),
  note           text not null default ''
);
create unique index if not exists pos_shifts_one_open on public.pos_shifts (location_id, opened_by) where status = 'open';

create sequence if not exists public.quotation_no_seq;
create table if not exists public.quotations (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null unique,
  quote_no        bigint not null default nextval('public.quotation_no_seq') unique,
  location_id     uuid not null references public.locations(id),
  created_by      uuid not null references public.profiles(id),
  salesperson_id  uuid references public.profiles(id),
  customer_id     uuid references public.customers(id),
  status          text not null default 'open' check (status in ('open', 'collected', 'cancelled')),
  net_total       numeric(12,2) not null,
  vat_total       numeric(12,2) not null,
  gross_total     numeric(12,2) not null,
  invoice_id      uuid,
  created_at      timestamptz not null default now()
);
create index if not exists quotations_open_idx on public.quotations (location_id, status, created_at desc);

create table if not exists public.quotation_lines (
  quotation_id  uuid not null references public.quotations(id) on delete cascade,
  line_no       integer not null,
  variant_id    uuid not null references public.product_variants(id),
  qty           numeric(12,3) not null check (qty > 0),
  unit_price    numeric(12,2) not null check (unit_price >= 0),
  discount      numeric(12,2) not null default 0 check (discount >= 0),
  primary key (quotation_id, line_no)
);

create table if not exists public.invoice_counters (
  location_id  uuid not null references public.locations(id),
  kind         text not null check (kind in ('invoice', 'credit_note')),
  last_no      bigint not null default 0,
  primary key (location_id, kind)
);
create sequence if not exists public.invoice_icv_seq;

create table if not exists public.invoices (
  id                   uuid primary key default gen_random_uuid(),   -- ZATCA invoice UUID
  client_id            uuid not null unique,
  kind                 text not null check (kind in ('invoice', 'credit_note')),
  number               text not null unique,
  seq                  bigint not null,
  icv                  bigint not null unique,                         -- invoice counter value (Phase 2)
  location_id          uuid not null references public.locations(id),
  shift_id             uuid references public.pos_shifts(id),
  cashier_id           uuid not null references public.profiles(id),
  salesperson_id       uuid references public.profiles(id),
  customer_id          uuid references public.customers(id),
  quotation_id         uuid references public.quotations(id),
  original_invoice_id  uuid references public.invoices(id),            -- credit notes
  reason               text not null default '',
  issued_at            timestamptz not null default now(),
  vat_rate             numeric(5,2) not null,
  net_total            numeric(12,2) not null,
  vat_total            numeric(12,2) not null,
  gross_total          numeric(12,2) not null,
  discount_total       numeric(12,2) not null default 0,
  cash_tendered        numeric(12,2),
  change_given         numeric(12,2) not null default 0,
  seller_name          text not null,
  seller_vat           text not null,
  qr                   text not null,
  prev_hash            text not null,
  hash                 text not null,
  einvoice_status      text not null default 'not_submitted' check (einvoice_status in ('not_submitted', 'reported', 'cleared', 'rejected')),
  einvoice_xml         text,
  offline_temp_no      text,
  approved_by          uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  unique (location_id, kind, seq)
);
create index if not exists invoices_issued_idx on public.invoices (issued_at desc);
create index if not exists invoices_shift_idx on public.invoices (shift_id);

create table if not exists public.invoice_lines (
  invoice_id    uuid not null references public.invoices(id) on delete restrict,
  line_no       integer not null,
  variant_id    uuid not null references public.product_variants(id),
  name          text not null,
  sku           text,
  qty           numeric(12,3) not null check (qty > 0),
  unit_price    numeric(12,2) not null,      -- VAT-inclusive
  discount      numeric(12,2) not null default 0,
  net           numeric(12,2) not null,
  vat           numeric(12,2) not null,
  gross         numeric(12,2) not null,
  returned_qty  numeric(12,3) not null default 0,
  primary key (invoice_id, line_no)
);

create table if not exists public.invoice_payments (
  invoice_id  uuid not null references public.invoices(id) on delete restrict,
  line_no     integer not null,
  method      text not null references public.payment_methods(code),
  amount      numeric(12,2) not null check (amount > 0),
  reference   text not null default '',
  primary key (invoice_id, line_no)
);

create table if not exists public.cash_movements (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null unique,
  shift_id     uuid not null references public.pos_shifts(id),
  kind         text not null check (kind in ('cash_out', 'cash_in')),
  amount       numeric(12,2) not null check (amount > 0),
  reason       text not null default '',
  created_by   uuid not null references public.profiles(id),
  approved_by  uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ZATCA Phase 1 QR (TLV → base64). Same encoding as src/lib/zatca.ts.
-- ---------------------------------------------------------------------
create or replace function public.zatca_qr(p_seller text, p_vat text, p_ts text, p_total text, p_vat_total text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare b bytea := ''::bytea; vals text[] := array[p_seller, p_vat, p_ts, p_total, p_vat_total]; v bytea; i int;
begin
  for i in 1..5 loop
    v := convert_to(vals[i], 'UTF8');
    if length(v) > 255 then raise exception 'ZATCA QR value % is longer than 255 bytes', i; end if;
    b := b || set_byte('\x00'::bytea, 0, i) || set_byte('\x00'::bytea, 0, length(v)) || v;
  end loop;
  return replace(encode(b, 'base64'), E'\n', '');
end;
$$;

-- One rounded line: gross = round(unit × qty) − discount; net = round(gross × 100 / (100 + rate)); vat = gross − net.
create or replace function public.pos_line_amounts(p_unit numeric, p_qty numeric, p_discount numeric, p_rate numeric)
returns table (gross numeric, net numeric, vat numeric)
language sql
immutable
set search_path = public
as $$
  with g as (select round(p_unit * p_qty, 2) - coalesce(p_discount, 0) as gross)
  select g.gross, round(g.gross * 100 / (100 + p_rate), 2), g.gross - round(g.gross * 100 / (100 + p_rate), 2) from g;
$$;

-- Internal: allocate the next number, link the hash chain, build the QR, insert the header.
create or replace function public.pos_new_invoice(
  p_kind text, p_client_id uuid, p_location uuid, p_shift uuid, p_cashier uuid, p_salesperson uuid,
  p_customer uuid, p_quotation uuid, p_original uuid, p_reason text, p_issued_at timestamptz,
  p_rate numeric, p_net numeric, p_vat numeric, p_gross numeric, p_discount numeric,
  p_tendered numeric, p_change numeric, p_offline_no text, p_approved_by uuid)
returns record
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq bigint; v_icv bigint; v_code text; v_number text; v_prev text; v_seller text; v_vatno text;
  v_id uuid := gen_random_uuid(); v_ts text; v_hash text; r record;
begin
  -- serialise the hash chain and the per-branch counters
  perform pg_advisory_xact_lock(hashtext('pos_invoice_chain'));
  select coalesce(nullif(legal_name_ar, ''), legal_name_en), vat_number into v_seller, v_vatno from company where id = 1;
  if v_vatno is null or v_seller is null or v_seller = '' or v_seller like '[%' then
    raise exception 'Company legal name and VAT number must be set before selling (Company details)';
  end if;
  select code into v_code from locations where id = p_location;
  insert into invoice_counters (location_id, kind, last_no) values (p_location, p_kind, 1)
  on conflict (location_id, kind) do update set last_no = invoice_counters.last_no + 1
  returning last_no into v_seq;
  v_number := v_code || case when p_kind = 'credit_note' then '-CN-' else '-' end || lpad(v_seq::text, 6, '0');
  v_icv := nextval('invoice_icv_seq');
  select hash into v_prev from invoices order by icv desc limit 1;
  -- ZATCA's starting previous-hash for the first invoice: base64(sha256("0")).
  v_prev := coalesce(v_prev, encode(sha256(convert_to('0', 'UTF8')), 'base64'));
  v_ts := to_char(p_issued_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_hash := encode(sha256(convert_to(concat_ws('|', v_id::text, v_number, v_icv::text, v_ts, p_gross::text, p_vat::text, v_prev), 'UTF8')), 'base64');
  insert into invoices (id, client_id, kind, number, seq, icv, location_id, shift_id, cashier_id, salesperson_id, customer_id,
                        quotation_id, original_invoice_id, reason, issued_at, vat_rate, net_total, vat_total, gross_total,
                        discount_total, cash_tendered, change_given, seller_name, seller_vat, qr, prev_hash, hash,
                        offline_temp_no, approved_by)
  values (v_id, p_client_id, p_kind, v_number, v_seq, v_icv, p_location, p_shift, p_cashier, p_salesperson, p_customer,
          p_quotation, p_original, coalesce(p_reason, ''), p_issued_at, p_rate, p_net, p_vat, p_gross,
          p_discount, p_tendered, coalesce(p_change, 0), v_seller, v_vatno,
          zatca_qr(v_seller, v_vatno, v_ts, to_char(p_gross, 'FM999999999990.00'), to_char(p_vat, 'FM999999999990.00')),
          v_prev, v_hash, p_offline_no, p_approved_by);
  select v_id as id, v_number as number into r;
  return r;
end;
$$;

-- Internal: check and store payments; returns cash paid (for change / shift totals).
create or replace function public.pos_store_payments(p_invoice uuid, p_payments jsonb, p_total numeric, p_customer uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare pay jsonb; n int := 0; v_sum numeric(12,2) := 0; v_cash numeric(12,2) := 0; v_kind text; v_amt numeric(12,2);
begin
  for pay in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    v_amt := (pay->>'amount')::numeric(12,2);
    if v_amt is null or v_amt <= 0 then raise exception 'Payment amounts must be greater than zero'; end if;
    select kind into v_kind from payment_methods where code = pay->>'method' and active;
    if v_kind is null then raise exception 'Unknown or inactive payment method %', pay->>'method'; end if;
    if v_kind = 'on_account' and p_customer is null then raise exception 'On account (آجل) needs a customer'; end if;
    n := n + 1;
    insert into invoice_payments (invoice_id, line_no, method, amount, reference)
    values (p_invoice, n, pay->>'method', v_amt, left(coalesce(pay->>'reference', ''), 100));
    v_sum := v_sum + v_amt;
    if v_kind = 'cash' then v_cash := v_cash + v_amt; end if;
  end loop;
  if v_sum <> p_total then
    raise exception 'Payments (%) must equal the total (%)', v_sum, p_total;
  end if;
  return v_cash;
end;
$$;

-- ---------------------------------------------------------------------
-- Shifts
-- ---------------------------------------------------------------------
create or replace function public.open_shift(p_client_id uuid, p_location uuid, p_user uuid, p_opening numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  select id into v_id from pos_shifts where client_id = p_client_id;
  if found then return jsonb_build_object('shift_id', v_id, 'duplicate', true); end if;
  select id into v_id from pos_shifts where location_id = p_location and opened_by = p_user and status = 'open';
  if found then return jsonb_build_object('shift_id', v_id, 'already_open', true); end if;
  if not exists (select 1 from locations where id = p_location and active and uses_pos) then
    raise exception 'This location does not use the cashier';
  end if;
  insert into pos_shifts (client_id, location_id, opened_by, opening_cash) values (p_client_id, p_location, p_user, coalesce(p_opening, 0))
  returning id into v_id;
  return jsonb_build_object('shift_id', v_id, 'duplicate', false);
end;
$$;

create or replace function public.shift_expected_cash(p_shift uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select s.opening_cash
       + coalesce((select sum(p.amount) from invoice_payments p join invoices i on i.id = p.invoice_id join payment_methods m on m.code = p.method
                    where i.shift_id = s.id and m.kind = 'cash' and i.kind = 'invoice'), 0)
       - coalesce((select sum(p.amount) from invoice_payments p join invoices i on i.id = p.invoice_id join payment_methods m on m.code = p.method
                    where i.shift_id = s.id and m.kind = 'cash' and i.kind = 'credit_note'), 0)
       + coalesce((select sum(amount) from cash_movements where shift_id = s.id and kind = 'cash_in'), 0)
       - coalesce((select sum(amount) from cash_movements where shift_id = s.id and kind = 'cash_out'), 0)
    from pos_shifts s where s.id = p_shift;
$$;

create or replace function public.close_shift(p_shift uuid, p_user uuid, p_counted numeric, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_exp numeric(12,2); s record;
begin
  select * into s from pos_shifts where id = p_shift for update;
  if not found then raise exception 'Shift not found'; end if;
  if s.status = 'closed' then
    return jsonb_build_object('expected', s.expected_cash, 'counted', s.counted_cash, 'difference', s.difference, 'duplicate', true);
  end if;
  v_exp := shift_expected_cash(p_shift);
  update pos_shifts set status = 'closed', closed_by = p_user, closed_at = now(), expected_cash = v_exp,
         counted_cash = p_counted, difference = p_counted - v_exp, note = coalesce(p_note, '')
   where id = p_shift;
  return jsonb_build_object('expected', v_exp, 'counted', p_counted, 'difference', p_counted - v_exp, 'duplicate', false);
end;
$$;

create or replace function public.post_cash_movement(p_client_id uuid, p_shift uuid, p_kind text, p_amount numeric, p_reason text, p_user uuid, p_approved_by uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  select id into v_id from cash_movements where client_id = p_client_id;
  if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  if not exists (select 1 from pos_shifts where id = p_shift and status = 'open') then raise exception 'The shift is not open'; end if;
  insert into cash_movements (client_id, shift_id, kind, amount, reason, created_by, approved_by)
  values (p_client_id, p_shift, p_kind, p_amount, coalesce(p_reason, ''), p_user, p_approved_by)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------
-- Quotation (desk) → collected at the cashier
-- p: {client_id, location_id, user_id, salesperson_id, customer_id, lines:[{variant_id, qty, unit_price, discount}]}
-- ---------------------------------------------------------------------
create or replace function public.save_quotation(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_no bigint; l jsonb; n int := 0; a record; v_rate numeric; t_net numeric(12,2) := 0; t_vat numeric(12,2) := 0; t_gross numeric(12,2) := 0;
begin
  select id, quote_no into v_id, v_no from quotations where client_id = (p->>'client_id')::uuid;
  if found then return jsonb_build_object('quotation_id', v_id, 'quote_no', v_no, 'duplicate', true); end if;
  v_rate := (select (value #>> '{}')::numeric from settings where key = 'vat_rate');
  if jsonb_array_length(coalesce(p->'lines', '[]'::jsonb)) = 0 then raise exception 'A quotation needs at least one item'; end if;
  insert into quotations (client_id, location_id, created_by, salesperson_id, customer_id, net_total, vat_total, gross_total)
  values ((p->>'client_id')::uuid, (p->>'location_id')::uuid, (p->>'user_id')::uuid, nullif(p->>'salesperson_id', '')::uuid,
          nullif(p->>'customer_id', '')::uuid, 0, 0, 0)
  returning id, quote_no into v_id, v_no;
  for l in select * from jsonb_array_elements(p->'lines') loop
    n := n + 1;
    select * into a from pos_line_amounts((l->>'unit_price')::numeric, (l->>'qty')::numeric, coalesce((l->>'discount')::numeric, 0), v_rate);
    if a.gross < 0 then raise exception 'A discount cannot be larger than the line'; end if;
    insert into quotation_lines (quotation_id, line_no, variant_id, qty, unit_price, discount)
    values (v_id, n, (l->>'variant_id')::uuid, (l->>'qty')::numeric, (l->>'unit_price')::numeric, coalesce((l->>'discount')::numeric, 0));
    t_net := t_net + a.net; t_vat := t_vat + a.vat; t_gross := t_gross + a.gross;
  end loop;
  update quotations set net_total = t_net, vat_total = t_vat, gross_total = t_gross where id = v_id;
  return jsonb_build_object('quotation_id', v_id, 'quote_no', v_no, 'gross_total', t_gross, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------
-- Sale → simplified tax invoice.
-- p: {client_id, location_id, shift_id, cashier_id, salesperson_id, customer_id, quotation_id,
--     lines:[{variant_id, qty, unit_price, discount}], payments:[{method, amount, reference}],
--     cash_tendered, issued_at, offline_temp_no, approved_by}
-- ---------------------------------------------------------------------
create or replace function public.post_sale(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing record; v_inv record; l jsonb; n int := 0; a record; v_rate numeric;
  t_net numeric(12,2) := 0; t_vat numeric(12,2) := 0; t_gross numeric(12,2) := 0; t_disc numeric(12,2) := 0;
  v_loc uuid := (p->>'location_id')::uuid; v_shift uuid := nullif(p->>'shift_id', '')::uuid;
  v_cashier uuid := (p->>'cashier_id')::uuid; v_customer uuid := nullif(p->>'customer_id', '')::uuid;
  v_quote uuid := nullif(p->>'quotation_id', '')::uuid; v_cash numeric(12,2); v_tender numeric(12,2); v_change numeric(12,2) := 0;
  v_name text; v_sku text; v_service boolean; v_issued timestamptz;
begin
  select id, number into v_existing from invoices where client_id = (p->>'client_id')::uuid;
  if found then return jsonb_build_object('invoice_id', v_existing.id, 'number', v_existing.number, 'duplicate', true); end if;

  if v_shift is null or not exists (select 1 from pos_shifts where id = v_shift and status = 'open' and location_id = v_loc) then
    raise exception 'Open a shift at this location before selling';
  end if;
  if jsonb_array_length(coalesce(p->'lines', '[]'::jsonb)) = 0 then raise exception 'A sale needs at least one item'; end if;
  if v_quote is not null and not exists (select 1 from quotations where id = v_quote and status = 'open') then
    raise exception 'This quotation is already collected or cancelled';
  end if;
  v_rate := (select (value #>> '{}')::numeric from settings where key = 'vat_rate');
  -- offline sales keep the time they happened (never in the future, never older than 7 days)
  v_issued := least(now(), greatest(coalesce(nullif(p->>'issued_at', '')::timestamptz, now()), now() - interval '7 days'));

  -- totals first (header needs them for the QR / hash)
  for l in select * from jsonb_array_elements(p->'lines') loop
    if (l->>'qty')::numeric <= 0 then raise exception 'Quantities must be greater than zero'; end if;
    if (l->>'unit_price')::numeric < 0 or coalesce((l->>'discount')::numeric, 0) < 0 then raise exception 'Prices and discounts cannot be negative'; end if;
    select * into a from pos_line_amounts((l->>'unit_price')::numeric, (l->>'qty')::numeric, coalesce((l->>'discount')::numeric, 0), v_rate);
    if a.gross < 0 then raise exception 'A discount cannot be larger than the line'; end if;
    t_net := t_net + a.net; t_vat := t_vat + a.vat; t_gross := t_gross + a.gross; t_disc := t_disc + coalesce((l->>'discount')::numeric, 0);
  end loop;

  v_tender := nullif(p->>'cash_tendered', '')::numeric(12,2);
  v_inv := pos_new_invoice('invoice', (p->>'client_id')::uuid, v_loc, v_shift, v_cashier, nullif(p->>'salesperson_id', '')::uuid,
                           v_customer, v_quote, null, '', v_issued, v_rate, t_net, t_vat, t_gross, t_disc, v_tender, 0,
                           nullif(p->>'offline_temp_no', ''), nullif(p->>'approved_by', '')::uuid);

  for l in select * from jsonb_array_elements(p->'lines') loop
    n := n + 1;
    select coalesce(nullif(pr.name_ar, ''), pr.name_en) || coalesce(' - ' || nullif(concat_ws(' / ', v.option1, v.option2, v.option3), ''), ''), v.sku, pr.is_service
      into v_name, v_sku, v_service
      from product_variants v join products pr on pr.id = v.product_id where v.id = (l->>'variant_id')::uuid;
    if v_name is null then raise exception 'Unknown item %', l->>'variant_id'; end if;
    select * into a from pos_line_amounts((l->>'unit_price')::numeric, (l->>'qty')::numeric, coalesce((l->>'discount')::numeric, 0), v_rate);
    insert into invoice_lines (invoice_id, line_no, variant_id, name, sku, qty, unit_price, discount, net, vat, gross)
    values (v_inv.id, n, (l->>'variant_id')::uuid, v_name, v_sku, (l->>'qty')::numeric, (l->>'unit_price')::numeric,
            coalesce((l->>'discount')::numeric, 0), a.net, a.vat, a.gross);
    if not v_service then
      perform apply_stock_change(v_loc, (l->>'variant_id')::uuid, -((l->>'qty')::numeric), 'sale', null, v_cashier, 'invoice', v_inv.id);
    end if;
  end loop;

  v_cash := pos_store_payments(v_inv.id, p->'payments', t_gross, v_customer);
  if v_tender is not null then
    if v_tender < v_cash then raise exception 'Cash given (%) is less than the cash part (%)', v_tender, v_cash; end if;
    v_change := v_tender - v_cash;
    update invoices set change_given = v_change where id = v_inv.id;
  end if;
  if v_quote is not null then
    update quotations set status = 'collected', invoice_id = v_inv.id where id = v_quote;
  end if;
  return jsonb_build_object('invoice_id', v_inv.id, 'number', v_inv.number, 'gross_total', t_gross, 'change', v_change, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------
-- Return → credit note (positive amounts), stock comes back.
-- With receipt: lines [{line_no, qty}] of the original; amounts are the original's, pro rata.
-- Without receipt: lines [{variant_id, qty, unit_price}].
-- p: {client_id, location_id, shift_id, cashier_id, original_invoice_id, customer_id, reason,
--     lines, payments (refund), approved_by}
-- ---------------------------------------------------------------------
create or replace function public.post_return(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing record; v_inv record; l jsonb; n int := 0; a record; v_rate numeric; o record; ol record;
  t_net numeric(12,2) := 0; t_vat numeric(12,2) := 0; t_gross numeric(12,2) := 0;
  v_loc uuid := (p->>'location_id')::uuid; v_shift uuid := nullif(p->>'shift_id', '')::uuid;
  v_orig uuid := nullif(p->>'original_invoice_id', '')::uuid; v_cashier uuid := (p->>'cashier_id')::uuid;
  v_q numeric(12,3); v_g numeric(12,2); v_n numeric(12,2); v_v numeric(12,2); v_name text; v_sku text; v_service boolean;
  v_lines jsonb := '[]'::jsonb;
begin
  select id, number into v_existing from invoices where client_id = (p->>'client_id')::uuid;
  if found then return jsonb_build_object('invoice_id', v_existing.id, 'number', v_existing.number, 'duplicate', true); end if;
  if v_shift is null or not exists (select 1 from pos_shifts where id = v_shift and status = 'open' and location_id = v_loc) then
    raise exception 'Open a shift at this location before a return';
  end if;
  if jsonb_array_length(coalesce(p->'lines', '[]'::jsonb)) = 0 then raise exception 'Choose at least one item to return'; end if;
  v_rate := (select (value #>> '{}')::numeric from settings where key = 'vat_rate');

  if v_orig is not null then
    select * into o from invoices where id = v_orig and kind = 'invoice' for update;
    if not found then raise exception 'Original invoice not found'; end if;
    v_rate := o.vat_rate;
  end if;

  -- work out each returned line's amounts
  for l in select * from jsonb_array_elements(p->'lines') loop
    v_q := (l->>'qty')::numeric;
    if v_q is null or v_q <= 0 then raise exception 'Return quantities must be greater than zero'; end if;
    if v_orig is not null then
      select * into ol from invoice_lines where invoice_id = v_orig and line_no = (l->>'line_no')::int for update;
      if not found then raise exception 'Line % is not on the original invoice', l->>'line_no'; end if;
      if v_q > ol.qty - ol.returned_qty then raise exception 'Only % of "%" can still be returned', ol.qty - ol.returned_qty, ol.name; end if;
      v_g := round(ol.gross * v_q / ol.qty, 2);
      v_n := round(v_g * 100 / (100 + v_rate), 2);
      v_v := v_g - v_n;
      v_lines := v_lines || jsonb_build_object('variant_id', ol.variant_id, 'name', ol.name, 'sku', ol.sku, 'qty', v_q,
                   'unit_price', ol.unit_price, 'discount', round(ol.discount * v_q / ol.qty, 2), 'net', v_n, 'vat', v_v, 'gross', v_g, 'orig_line', ol.line_no);
    else
      select * into a from pos_line_amounts((l->>'unit_price')::numeric, v_q, 0, v_rate);
      select coalesce(nullif(pr.name_ar, ''), pr.name_en) || coalesce(' - ' || nullif(concat_ws(' / ', v.option1, v.option2, v.option3), ''), ''), v.sku
        into v_name, v_sku from product_variants v join products pr on pr.id = v.product_id where v.id = (l->>'variant_id')::uuid;
      if v_name is null then raise exception 'Unknown item'; end if;
      v_g := a.gross; v_n := a.net; v_v := a.vat;
      v_lines := v_lines || jsonb_build_object('variant_id', l->>'variant_id', 'name', v_name, 'sku', v_sku, 'qty', v_q,
                   'unit_price', (l->>'unit_price')::numeric, 'discount', 0, 'net', v_n, 'vat', v_v, 'gross', v_g);
    end if;
    t_net := t_net + v_n; t_vat := t_vat + v_v; t_gross := t_gross + v_g;
  end loop;

  v_inv := pos_new_invoice('credit_note', (p->>'client_id')::uuid, v_loc, v_shift, v_cashier, null,
                           coalesce(nullif(p->>'customer_id', '')::uuid, o.customer_id), null, v_orig, left(coalesce(p->>'reason', ''), 300),
                           now(), v_rate, t_net, t_vat, t_gross, 0, null, 0, null, nullif(p->>'approved_by', '')::uuid);

  for l in select * from jsonb_array_elements(v_lines) loop
    n := n + 1;
    insert into invoice_lines (invoice_id, line_no, variant_id, name, sku, qty, unit_price, discount, net, vat, gross)
    values (v_inv.id, n, (l->>'variant_id')::uuid, l->>'name', l->>'sku', (l->>'qty')::numeric, (l->>'unit_price')::numeric,
            (l->>'discount')::numeric, (l->>'net')::numeric, (l->>'vat')::numeric, (l->>'gross')::numeric);
    if l ? 'orig_line' then
      update invoice_lines set returned_qty = returned_qty + (l->>'qty')::numeric where invoice_id = v_orig and line_no = (l->>'orig_line')::int;
    end if;
    select pr.is_service into v_service from product_variants v join products pr on pr.id = v.product_id where v.id = (l->>'variant_id')::uuid;
    if not v_service then
      perform apply_stock_change(v_loc, (l->>'variant_id')::uuid, (l->>'qty')::numeric, 'return', null, v_cashier, 'credit_note', v_inv.id);
    end if;
  end loop;

  perform pos_store_payments(v_inv.id, p->'payments', t_gross, coalesce(nullif(p->>'customer_id', '')::uuid, o.customer_id));
  return jsonb_build_object('invoice_id', v_inv.id, 'number', v_inv.number, 'gross_total', t_gross, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------
-- Sales list
-- ---------------------------------------------------------------------
create or replace view public.sales_list with (security_invoker = true) as
select i.id, i.kind, i.number, i.issued_at, i.location_id, l.code as location_code, l.name_en as location_en, l.name_ar as location_ar,
       i.gross_total, i.vat_total, i.net_total, i.customer_id, c.name as customer_name, c.phone as customer_phone,
       i.cashier_id, u.full_name as cashier_name, i.salesperson_id, sp.full_name as salesperson_name,
       i.original_invoice_id, i.offline_temp_no, i.einvoice_status, i.shift_id,
       (select string_agg(distinct p.method, ', ') from public.invoice_payments p where p.invoice_id = i.id) as methods
  from public.invoices i
  join public.locations l on l.id = i.location_id
  left join public.customers c on c.id = i.customer_id
  left join public.profiles u on u.id = i.cashier_id
  left join public.profiles sp on sp.id = i.salesperson_id;
revoke all on public.sales_list from anon, authenticated;

-- ---------------------------------------------------------------------
-- Security
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'zatca_qr(text,text,text,text,text)', 'pos_line_amounts(numeric,numeric,numeric,numeric)',
    'pos_new_invoice(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,uuid)',
    'pos_store_payments(uuid,jsonb,numeric,uuid)', 'open_shift(uuid,uuid,uuid,numeric)', 'shift_expected_cash(uuid)',
    'close_shift(uuid,uuid,numeric,text)', 'post_cash_movement(uuid,uuid,text,numeric,text,uuid,uuid)',
    'save_quotation(jsonb)', 'post_sale(jsonb)', 'post_return(jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

alter table public.pos_shifts       enable row level security;
alter table public.quotations       enable row level security;
alter table public.quotation_lines  enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.invoices         enable row level security;
alter table public.invoice_lines    enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.cash_movements   enable row level security;
revoke all on public.pos_shifts, public.quotations, public.quotation_lines, public.invoice_counters,
              public.invoices, public.invoice_lines, public.invoice_payments, public.cash_movements
  from anon, authenticated;
