-- =====================================================================
-- 0025_purchasing_b2b.sql — suppliers, purchase orders, receiving, supplier
-- payments; and B2B (business customer) orders with stages and payments.
--
-- Purchasing
--   suppliers                 one list (names already typed on items are added)
--   purchase_orders (+lines)  draft → ordered → partial → received (or cancelled)
--                             each in a currency with its rate to SAR
--   purchase_receipts (+lines) every time goods arrive: stock goes into the store
--                             (an "add" stock document), item cost becomes the
--                             average cost in SAR, and the supplier is owed it
--   supplier_payments         money paid to a supplier (its currency + rate)
-- B2B orders
--   b2b_orders (+lines)       new → in_production → ready → delivered → invoiced
--                             (or cancelled before delivery). Prices include VAT
--                             like the till; delivering takes the items out of
--                             the chosen store and puts the total on the
--                             customer's account
--   b2b_payments              money received for an order
-- Only adds (customer_balance / customer_statement now also count B2B orders).
-- Safe to run more than once.
-- =====================================================================

-- ------------------------------------------------------------ suppliers
create sequence if not exists public.supplier_no_seq;
create table if not exists public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  supplier_no bigint not null default nextval('public.supplier_no_seq') unique,
  name        text not null check (length(btrim(name)) between 1 and 120),
  factory     text check (factory is null or length(factory) <= 120),
  phone       text check (phone is null or length(phone) <= 30),
  email       text check (email is null or length(email) <= 120),
  country     text check (country is null or length(country) <= 60),
  currency    text not null default 'SAR' check (currency ~ '^[A-Z]{3}$'),
  vat_no      text check (vat_no is null or length(vat_no) <= 30),
  cr_no       text check (cr_no is null or length(cr_no) <= 30),
  address     text check (address is null or length(address) <= 300),
  notes       text not null default '' check (length(notes) <= 1000),
  active      boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists suppliers_name_uq on public.suppliers (lower(btrim(name)));

-- names already typed on items become suppliers
insert into public.suppliers (name, factory)
select distinct on (lower(btrim(p.supplier_name))) btrim(p.supplier_name), nullif(btrim(p.factory_name), '')
  from public.products p
 where nullif(btrim(p.supplier_name), '') is not null
 order by lower(btrim(p.supplier_name)), p.factory_name nulls last
on conflict do nothing;

-- ------------------------------------------------------------ purchase orders
create sequence if not exists public.purchase_no_seq;
create table if not exists public.purchase_orders (
  id           uuid primary key default gen_random_uuid(),
  po_no        bigint not null default nextval('public.purchase_no_seq') unique,
  client_id    uuid not null unique,
  supplier_id  uuid not null references public.suppliers(id),
  location_id  uuid not null references public.locations(id),
  currency     text not null default 'SAR' check (currency ~ '^[A-Z]{3}$'),
  rate         numeric(14,6) not null default 1 check (rate > 0),   -- 1 unit of currency = rate SAR
  status       text not null default 'draft' check (status in ('draft', 'ordered', 'partial', 'received', 'cancelled')),
  expected_on  date,
  supplier_ref text check (supplier_ref is null or length(supplier_ref) <= 60),
  notes        text not null default '' check (length(notes) <= 1000),
  total        numeric(14,2) not null default 0,                    -- in the order's currency
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists purchase_orders_supplier_idx on public.purchase_orders (supplier_id, created_at desc);
create index if not exists purchase_orders_status_idx on public.purchase_orders (status, created_at desc);

create table if not exists public.purchase_order_lines (
  order_id     uuid not null references public.purchase_orders(id) on delete cascade,
  line_no      int not null,
  variant_id   uuid not null references public.product_variants(id),
  qty          numeric(12,3) not null check (qty > 0),
  unit_cost    numeric(14,4) not null check (unit_cost >= 0),          -- in the order's currency
  received_qty numeric(12,3) not null default 0 check (received_qty >= 0),
  primary key (order_id, line_no)
);

create table if not exists public.purchase_receipts (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null unique,
  order_id     uuid not null references public.purchase_orders(id),
  supplier_id  uuid not null references public.suppliers(id),
  stock_doc_id uuid references public.stock_docs(id),
  bill_no      text check (bill_no is null or length(bill_no) <= 60),  -- the supplier's invoice no.
  received_on  date not null default current_date,
  currency     text not null,
  rate         numeric(14,6) not null check (rate > 0),
  amount       numeric(14,2) not null,                                 -- in the currency
  amount_sar   numeric(14,2) not null,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists purchase_receipts_supplier_idx on public.purchase_receipts (supplier_id, received_on);
create index if not exists purchase_receipts_order_idx on public.purchase_receipts (order_id);

create table if not exists public.purchase_receipt_lines (
  receipt_id uuid not null references public.purchase_receipts(id) on delete cascade,
  line_no    int not null,
  variant_id uuid not null references public.product_variants(id),
  qty        numeric(12,3) not null check (qty > 0),
  unit_cost  numeric(14,4) not null,
  primary key (receipt_id, line_no)
);

create table if not exists public.supplier_payments (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null unique,
  supplier_id uuid not null references public.suppliers(id),
  paid_on     date not null default current_date,
  currency    text not null check (currency ~ '^[A-Z]{3}$'),
  rate        numeric(14,6) not null check (rate > 0),
  amount      numeric(14,2) not null check (amount > 0),
  amount_sar  numeric(14,2) not null,
  method      text not null default 'bank' check (method in ('bank', 'cash', 'cheque', 'other')),
  ref         text check (ref is null or length(ref) <= 60),
  note        text not null default '' check (length(note) <= 500),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists supplier_payments_supplier_idx on public.supplier_payments (supplier_id, paid_on);

-- What each supplier is owed: in the supplier's own currency and in SAR.
create or replace view public.supplier_list with (security_invoker = true) as
select s.*,
       coalesce((select sum(r.amount) from public.purchase_receipts r where r.supplier_id = s.id and r.currency = s.currency), 0)
     - coalesce((select sum(p.amount) from public.supplier_payments p where p.supplier_id = s.id and p.currency = s.currency), 0) as balance,
       coalesce((select sum(r.amount_sar) from public.purchase_receipts r where r.supplier_id = s.id), 0)
     - coalesce((select sum(p.amount_sar) from public.supplier_payments p where p.supplier_id = s.id), 0) as balance_sar,
       (select count(*) from public.purchase_orders o where o.supplier_id = s.id and o.status in ('ordered', 'partial')) as open_orders
  from public.suppliers s;

-- Statement: goods received (owed) and payments, oldest first.
create or replace view public.supplier_statement with (security_invoker = true) as
select r.supplier_id, r.received_on as on_date, r.created_at, 'receipt'::text as kind, r.order_id, r.id as ref_id,
       coalesce(r.bill_no, '') as ref, r.currency, r.amount, r.amount_sar
  from public.purchase_receipts r
union all
select p.supplier_id, p.paid_on, p.created_at, 'payment', null, p.id, coalesce(p.ref, ''), p.currency, -p.amount, -p.amount_sar
  from public.supplier_payments p;

-- ------------------------------------------------------------ purchase functions
-- save_purchase_order(p): create, or change while nothing has been received.
-- p: {id?, client_id, supplier_id, location_id, currency, rate, expected_on, supplier_ref, notes,
--     status ('draft'|'ordered'), user_id, lines:[{variant_id, qty, unit_cost}]}
create or replace function public.save_purchase_order(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid; v_no bigint; v_status text := coalesce(nullif(p->>'status', ''), 'draft');
  l jsonb; n int := 0; v_total numeric := 0; v_qty numeric; v_cost numeric;
begin
  if v_status not in ('draft', 'ordered') then raise exception 'bad_status'; end if;
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then raise exception 'no_lines'; end if;
  if not exists (select 1 from suppliers where id = (p->>'supplier_id')::uuid and active) then raise exception 'bad_supplier'; end if;
  if coalesce((p->>'rate')::numeric, 0) <= 0 then raise exception 'bad_rate'; end if;

  if v_id is null then
    select id, po_no into v_id, v_no from purchase_orders where client_id = (p->>'client_id')::uuid;
    if found then return jsonb_build_object('id', v_id, 'po_no', v_no, 'duplicate', true); end if;
    insert into purchase_orders (client_id, supplier_id, location_id, currency, rate, status, expected_on, supplier_ref, notes, created_by)
    values ((p->>'client_id')::uuid, (p->>'supplier_id')::uuid, (p->>'location_id')::uuid, upper(p->>'currency'), (p->>'rate')::numeric,
            v_status, nullif(p->>'expected_on', '')::date, nullif(p->>'supplier_ref', ''), coalesce(p->>'notes', ''), nullif(p->>'user_id', '')::uuid)
    returning id, po_no into v_id, v_no;
  else
    select po_no into v_no from purchase_orders where id = v_id and status in ('draft', 'ordered') for update;
    if not found then raise exception 'locked'; end if;
    if exists (select 1 from purchase_receipts where order_id = v_id) then raise exception 'locked'; end if;
    update purchase_orders set supplier_id = (p->>'supplier_id')::uuid, location_id = (p->>'location_id')::uuid,
           currency = upper(p->>'currency'), rate = (p->>'rate')::numeric, status = v_status,
           expected_on = nullif(p->>'expected_on', '')::date, supplier_ref = nullif(p->>'supplier_ref', ''),
           notes = coalesce(p->>'notes', ''), updated_at = now()
     where id = v_id;
    delete from purchase_order_lines where order_id = v_id;
  end if;

  for l in select * from jsonb_array_elements(p->'lines') loop
    v_qty := (l->>'qty')::numeric; v_cost := (l->>'unit_cost')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'bad_qty'; end if;
    if v_cost is null or v_cost < 0 then raise exception 'bad_cost'; end if;
    if not exists (select 1 from product_variants pv join products pr on pr.id = pv.product_id where pv.id = (l->>'variant_id')::uuid and not pr.is_service) then
      raise exception 'bad_item';
    end if;
    n := n + 1;
    insert into purchase_order_lines (order_id, line_no, variant_id, qty, unit_cost) values (v_id, n, (l->>'variant_id')::uuid, v_qty, v_cost);
    v_total := v_total + round(v_qty * v_cost, 2);
  end loop;
  update purchase_orders set total = v_total where id = v_id;
  return jsonb_build_object('id', v_id, 'po_no', v_no, 'duplicate', false);
end;
$$;

-- receive_purchase(p): goods arrived. p: {client_id, order_id, bill_no, received_on, user_id, lines:[{line_no, qty}]}
-- Stock goes into the order's store; each item's cost becomes the average cost in SAR.
create or replace function public.receive_purchase(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o purchase_orders; l jsonb; ln purchase_order_lines; v_qty numeric; v_rid uuid; v_doc jsonb; n int := 0;
  v_amount numeric := 0; v_lines jsonb := '[]'::jsonb; v_have numeric; v_old numeric; v_new_cost numeric;
begin
  select id into v_rid from purchase_receipts where client_id = (p->>'client_id')::uuid;
  if found then return jsonb_build_object('receipt_id', v_rid, 'duplicate', true); end if;
  select * into o from purchase_orders where id = (p->>'order_id')::uuid for update;
  if not found then raise exception 'not_found'; end if;
  if o.status not in ('ordered', 'partial', 'draft') then raise exception 'locked'; end if;
  if jsonb_typeof(p->'lines') <> 'array' then raise exception 'no_lines'; end if;

  insert into purchase_receipts (client_id, order_id, supplier_id, bill_no, received_on, currency, rate, amount, amount_sar, created_by)
  values ((p->>'client_id')::uuid, o.id, o.supplier_id, nullif(p->>'bill_no', ''), coalesce(nullif(p->>'received_on', '')::date, current_date),
          o.currency, o.rate, 0, 0, nullif(p->>'user_id', '')::uuid)
  returning id into v_rid;

  for l in select * from jsonb_array_elements(p->'lines') loop
    v_qty := coalesce(nullif(l->>'qty', '')::numeric, 0);
    continue when v_qty = 0;
    if v_qty < 0 then raise exception 'bad_qty'; end if;
    select * into ln from purchase_order_lines where order_id = o.id and line_no = (l->>'line_no')::int for update;
    if not found then raise exception 'bad_line'; end if;
    if ln.received_qty + v_qty > ln.qty then raise exception 'too_many'; end if;
    -- average cost in SAR, using the stock before this receipt
    v_have := greatest(coalesce((select sum(qty) from stock_levels where variant_id = ln.variant_id), 0), 0);
    v_old := coalesce((select cost from product_variants where id = ln.variant_id), 0);
    v_new_cost := round(((v_have * v_old) + (v_qty * ln.unit_cost * o.rate)) / (v_have + v_qty), 2);
    update product_variants set cost = v_new_cost where id = ln.variant_id;
    update purchase_order_lines set received_qty = received_qty + v_qty where order_id = o.id and line_no = ln.line_no;
    n := n + 1;
    insert into purchase_receipt_lines (receipt_id, line_no, variant_id, qty, unit_cost) values (v_rid, n, ln.variant_id, v_qty, ln.unit_cost);
    v_amount := v_amount + round(v_qty * ln.unit_cost, 2);
    v_lines := v_lines || jsonb_build_object('variant_id', ln.variant_id, 'qty', v_qty);
  end loop;
  if n = 0 then raise exception 'no_lines'; end if;

  v_doc := post_stock_doc2(jsonb_build_object('client_id', (p->>'client_id'), 'kind', 'receipt', 'location_id', o.location_id,
            'lines', v_lines, 'note', 'PO-' || o.po_no || coalesce(' / ' || nullif(p->>'bill_no', ''), ''), 'user_id', p->>'user_id'));
  update purchase_receipts set stock_doc_id = (v_doc->>'doc_id')::uuid, amount = v_amount, amount_sar = round(v_amount * o.rate, 2) where id = v_rid;
  update purchase_orders set updated_at = now(),
         status = case when exists (select 1 from purchase_order_lines where order_id = o.id and received_qty < qty) then 'partial' else 'received' end
   where id = o.id;
  return jsonb_build_object('receipt_id', v_rid, 'doc_no', v_doc->>'doc_no', 'amount', v_amount, 'duplicate', false);
end;
$$;

-- ------------------------------------------------------------ B2B orders
create sequence if not exists public.b2b_no_seq;
create table if not exists public.b2b_orders (
  id            uuid primary key default gen_random_uuid(),
  order_no      bigint not null default nextval('public.b2b_no_seq') unique,
  client_id     uuid not null unique,
  customer_id   uuid not null references public.customers(id),
  location_id   uuid not null references public.locations(id),     -- delivered from this store
  status        text not null default 'new' check (status in ('new', 'in_production', 'ready', 'delivered', 'invoiced', 'cancelled')),
  due_on        date,
  customer_ref  text check (customer_ref is null or length(customer_ref) <= 60),   -- the customer's PO no.
  invoice_ref   text check (invoice_ref is null or length(invoice_ref) <= 60),
  notes         text not null default '' check (length(notes) <= 1000),
  vat_rate      numeric(5,2) not null,
  net_total     numeric(14,2) not null default 0,
  vat_total     numeric(14,2) not null default 0,
  gross_total   numeric(14,2) not null default 0,
  delivered_at  timestamptz,
  delivered_by  uuid references public.profiles(id) on delete set null,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists b2b_orders_customer_idx on public.b2b_orders (customer_id, created_at desc);
create index if not exists b2b_orders_status_idx on public.b2b_orders (status, created_at desc);

create table if not exists public.b2b_order_lines (
  order_id     uuid not null references public.b2b_orders(id) on delete cascade,
  line_no      int not null,
  variant_id   uuid not null references public.product_variants(id),
  qty          numeric(12,3) not null check (qty > 0),
  unit_price   numeric(12,2) not null check (unit_price >= 0),     -- including VAT, like the till
  discount_pct numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  gross        numeric(14,2) not null,
  primary key (order_id, line_no)
);

create table if not exists public.b2b_payments (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null unique,
  order_id    uuid not null references public.b2b_orders(id),
  customer_id uuid not null references public.customers(id),
  paid_on     date not null default current_date,
  amount      numeric(14,2) not null check (amount > 0),
  method      text not null default 'bank' check (method in ('bank', 'cash', 'cheque', 'card', 'other')),
  ref         text check (ref is null or length(ref) <= 60),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists b2b_payments_order_idx on public.b2b_payments (order_id);
create index if not exists b2b_payments_customer_idx on public.b2b_payments (customer_id);

create or replace view public.b2b_list with (security_invoker = true) as
select o.*, c.name as customer_name, c.customer_no, c.phone,
       coalesce((select sum(p.amount) from public.b2b_payments p where p.order_id = o.id), 0) as paid,
       o.gross_total - coalesce((select sum(p.amount) from public.b2b_payments p where p.order_id = o.id), 0) as due,
       (select count(*) from public.b2b_order_lines l where l.order_id = o.id) as lines
  from public.b2b_orders o join public.customers c on c.id = o.customer_id;

-- save_b2b_order(p): create, or change before delivery.
-- p: {id?, client_id, customer_id, location_id, due_on, customer_ref, notes, user_id,
--     lines:[{variant_id, qty, unit_price, discount_pct}]}
create or replace function public.save_b2b_order(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid; v_no bigint; l jsonb; n int := 0;
  v_rate numeric := coalesce((select (value #>> '{}')::numeric from settings where key = 'vat_rate'), 15);
  v_qty numeric; v_price numeric; v_disc numeric; v_gross numeric; v_g numeric := 0; v_net numeric := 0;
begin
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then raise exception 'no_lines'; end if;
  if not exists (select 1 from customers where id = (p->>'customer_id')::uuid) then raise exception 'bad_customer'; end if;
  if v_id is null then
    select id, order_no into v_id, v_no from b2b_orders where client_id = (p->>'client_id')::uuid;
    if found then return jsonb_build_object('id', v_id, 'order_no', v_no, 'duplicate', true); end if;
    insert into b2b_orders (client_id, customer_id, location_id, due_on, customer_ref, notes, vat_rate, created_by)
    values ((p->>'client_id')::uuid, (p->>'customer_id')::uuid, (p->>'location_id')::uuid, nullif(p->>'due_on', '')::date,
            nullif(p->>'customer_ref', ''), coalesce(p->>'notes', ''), v_rate, nullif(p->>'user_id', '')::uuid)
    returning id, order_no into v_id, v_no;
  else
    select order_no into v_no from b2b_orders where id = v_id and status in ('new', 'in_production', 'ready') for update;
    if not found then raise exception 'locked'; end if;
    update b2b_orders set customer_id = (p->>'customer_id')::uuid, location_id = (p->>'location_id')::uuid,
           due_on = nullif(p->>'due_on', '')::date, customer_ref = nullif(p->>'customer_ref', ''), notes = coalesce(p->>'notes', ''),
           vat_rate = v_rate, updated_at = now()
     where id = v_id;
    delete from b2b_order_lines where order_id = v_id;
  end if;

  for l in select * from jsonb_array_elements(p->'lines') loop
    v_qty := (l->>'qty')::numeric; v_price := (l->>'unit_price')::numeric; v_disc := coalesce(nullif(l->>'discount_pct', '')::numeric, 0);
    if v_qty is null or v_qty <= 0 then raise exception 'bad_qty'; end if;
    if v_price is null or v_price < 0 then raise exception 'bad_price'; end if;
    if v_disc < 0 or v_disc > 100 then raise exception 'bad_discount'; end if;
    if not exists (select 1 from product_variants where id = (l->>'variant_id')::uuid) then raise exception 'bad_item'; end if;
    v_gross := round(v_price * v_qty * (100 - v_disc) / 100, 2);
    n := n + 1;
    insert into b2b_order_lines (order_id, line_no, variant_id, qty, unit_price, discount_pct, gross)
    values (v_id, n, (l->>'variant_id')::uuid, v_qty, v_price, v_disc, v_gross);
    v_g := v_g + v_gross;
    v_net := v_net + round(v_gross * 100 / (100 + v_rate), 2);
  end loop;
  update b2b_orders set gross_total = v_g, net_total = v_net, vat_total = v_g - v_net where id = v_id;
  return jsonb_build_object('id', v_id, 'order_no', v_no, 'duplicate', false);
end;
$$;

-- set_b2b_status: move the order along. Delivering takes the items out of the store (once).
create or replace function public.set_b2b_status(p_order uuid, p_status text, p_user uuid, p_invoice_ref text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare o b2b_orders; ln b2b_order_lines;
begin
  select * into o from b2b_orders where id = p_order for update;
  if not found then raise exception 'not_found'; end if;
  if p_status not in ('new', 'in_production', 'ready', 'delivered', 'invoiced', 'cancelled') then raise exception 'bad_status'; end if;
  if o.status = p_status then return jsonb_build_object('status', o.status, 'unchanged', true); end if;
  if o.status = 'cancelled' then raise exception 'locked'; end if;
  if o.status in ('delivered', 'invoiced') and p_status not in ('delivered', 'invoiced') then raise exception 'already_delivered'; end if;
  if p_status = 'invoiced' and o.status <> 'delivered' then raise exception 'deliver_first'; end if;
  if p_status = 'cancelled' and exists (select 1 from b2b_payments where order_id = o.id) then raise exception 'has_payments'; end if;

  if p_status = 'delivered' and o.delivered_at is null then
    for ln in select * from b2b_order_lines where order_id = o.id order by line_no loop
      if exists (select 1 from product_variants pv join products pr on pr.id = pv.product_id where pv.id = ln.variant_id and not pr.is_service) then
        perform apply_stock_change(o.location_id, ln.variant_id, -ln.qty, 'sale', null, p_user, 'b2b_order', o.id);
      end if;
    end loop;
    update b2b_orders set delivered_at = now(), delivered_by = p_user where id = o.id;
  end if;
  update b2b_orders set status = p_status, updated_at = now(),
         invoice_ref = case when p_status = 'invoiced' then coalesce(nullif(btrim(p_invoice_ref), ''), invoice_ref) else invoice_ref end
   where id = o.id;
  return jsonb_build_object('status', p_status, 'unchanged', false);
end;
$$;

-- Customer balance and statement also count delivered B2B orders and their payments.
create or replace function public.customer_balance(p_customer uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce((select sum(case when i.kind = 'invoice' then p.amount else -p.amount end)
                     from invoice_payments p join invoices i on i.id = p.invoice_id join payment_methods m on m.code = p.method
                    where i.customer_id = p_customer and m.kind = 'on_account'), 0)
       - coalesce((select sum(amount) from drawer_entries where customer_id = p_customer and kind = 'customer_payment'), 0)
       + coalesce((select sum(gross_total) from b2b_orders where customer_id = p_customer and status in ('delivered', 'invoiced')), 0)
       - coalesce((select sum(amount) from b2b_payments where customer_id = p_customer), 0);
$$;

create or replace view public.customer_statement with (security_invoker = true) as
select i.customer_id, i.issued_at as at, i.kind as kind, i.number as ref, i.id as invoice_id,
       case when i.kind = 'invoice' then p.amount else -p.amount end as amount
  from public.invoice_payments p
  join public.invoices i on i.id = p.invoice_id
  join public.payment_methods m on m.code = p.method
 where m.kind = 'on_account' and i.customer_id is not null
union all
select c.customer_id, c.created_at, 'payment', coalesce(c.reason, ''), null, -c.amount
  from public.drawer_entries c where c.kind = 'customer_payment'
union all
select o.customer_id, o.delivered_at, 'b2b_order', 'B2B-' || o.order_no, null, o.gross_total
  from public.b2b_orders o where o.status in ('delivered', 'invoiced')
union all
select b.customer_id, b.created_at, 'payment', 'B2B-' || o.order_no || coalesce(' ' || b.ref, ''), null, -b.amount
  from public.b2b_payments b join public.b2b_orders o on o.id = b.order_id;

-- ------------------------------------------------------------ access
alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_lines enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.b2b_orders enable row level security;
alter table public.b2b_order_lines enable row level security;
alter table public.b2b_payments enable row level security;
revoke all on public.suppliers, public.purchase_orders, public.purchase_order_lines, public.purchase_receipts, public.purchase_receipt_lines, public.supplier_payments, public.b2b_orders, public.b2b_order_lines, public.b2b_payments from anon, authenticated;
grant all on public.suppliers, public.purchase_orders, public.purchase_order_lines, public.purchase_receipts, public.purchase_receipt_lines, public.supplier_payments, public.b2b_orders, public.b2b_order_lines, public.b2b_payments to service_role;
revoke all on public.supplier_list, public.supplier_statement, public.b2b_list, public.customer_statement from anon, authenticated;
grant select on public.supplier_list, public.supplier_statement, public.b2b_list, public.customer_statement to service_role;
grant usage on sequence public.supplier_no_seq, public.purchase_no_seq, public.b2b_no_seq to service_role;
revoke all on function public.save_purchase_order(jsonb), public.receive_purchase(jsonb), public.save_b2b_order(jsonb),
                       public.set_b2b_status(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.save_purchase_order(jsonb), public.receive_purchase(jsonb), public.save_b2b_order(jsonb),
                          public.set_b2b_status(uuid, text, uuid, text) to service_role;
