-- =====================================================================
-- 0012_pos_extras.sql — cashier extras.
--  * Expenses (owner-managed expense types) and customer payments in the drawer.
--  * Customers: credit limit, usual discount, balance (on account sales −
--    on account refunds − payments) and statement.
--  * "On account" (آجل) only within the customer's credit limit.
--  * Customer's receipt link: a long random token per invoice (no login).
--  * Collect several quotations of one customer on one receipt; edit a quotation.
-- Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Expense types + drawer movements
-- ---------------------------------------------------------------------
create table if not exists public.expense_types (
  id       uuid primary key default gen_random_uuid(),
  name_en  text not null,
  name_ar  text not null default '',
  active   boolean not null default true,
  sort     integer not null default 0
);
create unique index if not exists expense_types_name_uq on public.expense_types (lower(name_en));
insert into public.expense_types (name_en, name_ar, sort) values
  ('Transport', 'مواصلات', 1), ('Cleaning', 'نظافة', 2), ('Hospitality', 'ضيافة', 3),
  ('Maintenance', 'صيانة', 4), ('Office supplies', 'أدوات مكتبية', 5), ('Other', 'أخرى', 9)
on conflict do nothing;
alter table public.expense_types enable row level security;
revoke all on public.expense_types from anon, authenticated;

-- Expenses and customer payments get their own table (cash in/out stay in cash_movements).
create table if not exists public.drawer_entries (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null unique,
  shift_id         uuid not null references public.pos_shifts(id),
  kind             text not null check (kind in ('expense', 'customer_payment')),
  amount           numeric(12,2) not null check (amount > 0),
  reason           text not null default '',
  expense_type_id  uuid references public.expense_types(id),
  customer_id      uuid references public.customers(id),
  method           text references public.payment_methods(code),
  created_by       uuid not null references public.profiles(id),
  approved_by      uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  check ((kind = 'expense') = (expense_type_id is not null)),
  check ((kind = 'customer_payment') = (customer_id is not null))
);
create index if not exists drawer_entries_shift_idx on public.drawer_entries (shift_id);
create index if not exists drawer_entries_customer_idx on public.drawer_entries (customer_id);
alter table public.drawer_entries enable row level security;
revoke all on public.drawer_entries from anon, authenticated;

-- ---------------------------------------------------------------------
-- Customers: credit limit, usual discount, balance
-- ---------------------------------------------------------------------
alter table public.customers add column if not exists credit_limit numeric(12,2) check (credit_limit is null or credit_limit >= 0);
alter table public.customers add column if not exists discount_pct numeric(5,2) not null default 0 check (discount_pct >= 0 and discount_pct <= 100);

-- What a customer owes: on-account sales − on-account refunds − payments received.
create or replace function public.customer_balance(p_customer uuid)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce((select sum(case when i.kind = 'invoice' then p.amount else -p.amount end)
                     from invoice_payments p join invoices i on i.id = p.invoice_id join payment_methods m on m.code = p.method
                    where i.customer_id = p_customer and m.kind = 'on_account'), 0)
       - coalesce((select sum(amount) from drawer_entries where customer_id = p_customer and kind = 'customer_payment'), 0);
$$;

create or replace view public.customer_list with (security_invoker = true) as
select c.*, public.customer_balance(c.id)::numeric(12,2) as balance,
       (select count(*) from public.invoices i where i.customer_id = c.id and i.kind = 'invoice') as invoices,
       (select max(i.issued_at) from public.invoices i where i.customer_id = c.id) as last_visit
  from public.customers c;
revoke all on public.customer_list from anon, authenticated;

-- Statement lines: on-account sales/refunds and payments, oldest first.
create or replace view public.customer_statement with (security_invoker = true) as
select i.customer_id, i.issued_at as at, i.kind as kind, i.number as ref, i.id as invoice_id,
       case when i.kind = 'invoice' then p.amount else -p.amount end as amount
  from public.invoice_payments p
  join public.invoices i on i.id = p.invoice_id
  join public.payment_methods m on m.code = p.method
 where m.kind = 'on_account' and i.customer_id is not null
union all
select c.customer_id, c.created_at, 'payment', coalesce(c.reason, ''), null, -c.amount
  from public.drawer_entries c where c.kind = 'customer_payment';
revoke all on public.customer_statement from anon, authenticated;

-- Payments: on account only within the credit limit (no limit set = not allowed).
create or replace function public.pos_store_payments(p_invoice uuid, p_payments jsonb, p_total numeric, p_customer uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare pay jsonb; n int := 0; v_sum numeric(12,2) := 0; v_cash numeric(12,2) := 0; v_kind text; v_amt numeric(12,2);
        v_account numeric(12,2) := 0; v_limit numeric(12,2); v_is_sale boolean;
begin
  v_is_sale := exists (select 1 from invoices where id = p_invoice and kind = 'invoice');
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
    if v_kind = 'on_account' then v_account := v_account + v_amt; end if;
  end loop;
  if v_sum <> p_total then
    raise exception 'Payments (%) must equal the total (%)', v_sum, p_total;
  end if;
  if v_is_sale and v_account > 0 then
    select credit_limit into v_limit from customers where id = p_customer;
    -- the balance already includes this invoice's on-account part
    if v_limit is null or customer_balance(p_customer) > v_limit then
      raise exception 'credit_limit: % allowed', coalesce(v_limit, 0);
    end if;
  end if;
  return v_cash;
end;
$$;

-- Drawer: expected cash also counts expenses and cash customer payments.
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
       + coalesce((select sum(d.amount) from drawer_entries d left join payment_methods m on m.code = d.method
                    where d.shift_id = s.id and d.kind = 'customer_payment' and coalesce(m.kind, 'cash') = 'cash'), 0)
       - coalesce((select sum(amount) from cash_movements where shift_id = s.id and kind = 'cash_out'), 0)
       - coalesce((select sum(amount) from drawer_entries where shift_id = s.id and kind = 'expense'), 0)
    from pos_shifts s where s.id = p_shift;
$$;

-- p: {client_id, shift_id, kind, amount, reason, user_id, approved_by, expense_type_id, customer_id, method}
create or replace function public.post_cash_movement2(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_kind text := p->>'kind';
begin
  select id into v_id from cash_movements where client_id = (p->>'client_id')::uuid;
  if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  select id into v_id from drawer_entries where client_id = (p->>'client_id')::uuid;
  if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  if not exists (select 1 from pos_shifts where id = (p->>'shift_id')::uuid and status = 'open') then raise exception 'The shift is not open'; end if;
  if v_kind not in ('cash_out', 'cash_in', 'expense', 'customer_payment') then raise exception 'bad_kind'; end if;
  if v_kind = 'expense' and nullif(p->>'expense_type_id', '') is null then raise exception 'expense_type_required'; end if;
  if v_kind = 'customer_payment' and nullif(p->>'customer_id', '') is null then raise exception 'customer_required'; end if;
  if (p->>'amount')::numeric <= 0 then raise exception 'bad_amount'; end if;
  if v_kind in ('cash_out', 'cash_in') then
    insert into cash_movements (client_id, shift_id, kind, amount, reason, created_by, approved_by)
    values ((p->>'client_id')::uuid, (p->>'shift_id')::uuid, v_kind, (p->>'amount')::numeric(12,2), coalesce(p->>'reason', ''),
            (p->>'user_id')::uuid, nullif(p->>'approved_by', '')::uuid)
    returning id into v_id;
  else
    insert into drawer_entries (client_id, shift_id, kind, amount, reason, created_by, approved_by, expense_type_id, customer_id, method)
    values ((p->>'client_id')::uuid, (p->>'shift_id')::uuid, v_kind, (p->>'amount')::numeric(12,2), coalesce(p->>'reason', ''),
            (p->>'user_id')::uuid, nullif(p->>'approved_by', '')::uuid,
            case when v_kind = 'expense' then nullif(p->>'expense_type_id', '')::uuid end,
            case when v_kind = 'customer_payment' then nullif(p->>'customer_id', '')::uuid end,
            case when v_kind = 'customer_payment' then coalesce(nullif(p->>'method', ''), 'cash') end)
    returning id into v_id;
  end if;
  return jsonb_build_object('id', v_id, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------
-- Customer's receipt link (no login): a long random token per invoice.
-- ---------------------------------------------------------------------
-- New invoices get a token; older ones simply have no link.
alter table public.invoices add column if not exists public_token text;
alter table public.invoices alter column public_token set default translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
create unique index if not exists invoices_public_token_uq on public.invoices (public_token);

-- ---------------------------------------------------------------------
-- Quotations: edit an open quotation (lines replaced, totals recomputed);
-- collect several open quotations of one customer on one receipt.
-- ---------------------------------------------------------------------
alter table public.quotations add column if not exists updated_at timestamptz;
-- Editing keeps history: old lines are switched off (active = false), new lines added after them.
alter table public.quotation_lines add column if not exists active boolean not null default true;

create or replace function public.update_quotation(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid := (p->>'quotation_id')::uuid; l jsonb; n int := 0; a record; v_rate numeric;
        t_net numeric(12,2) := 0; t_vat numeric(12,2) := 0; t_gross numeric(12,2) := 0; v_no bigint;
begin
  select quote_no into v_no from quotations where id = v_id and status = 'open' for update;
  if not found then raise exception 'quote_not_found'; end if;
  if jsonb_array_length(coalesce(p->'lines', '[]'::jsonb)) = 0 then raise exception 'A quotation needs at least one item'; end if;
  v_rate := (select (value #>> '{}')::numeric from settings where key = 'vat_rate');
  update quotation_lines set active = false where quotation_id = v_id and active;
  n := coalesce((select max(line_no) from quotation_lines where quotation_id = v_id), 0);
  for l in select * from jsonb_array_elements(p->'lines') loop
    n := n + 1;
    select * into a from pos_line_amounts((l->>'unit_price')::numeric, (l->>'qty')::numeric, coalesce((l->>'discount')::numeric, 0), v_rate);
    if a.gross < 0 then raise exception 'A discount cannot be larger than the line'; end if;
    insert into quotation_lines (quotation_id, line_no, variant_id, qty, unit_price, discount)
    values (v_id, n, (l->>'variant_id')::uuid, (l->>'qty')::numeric, (l->>'unit_price')::numeric, coalesce((l->>'discount')::numeric, 0));
    t_net := t_net + a.net; t_vat := t_vat + a.vat; t_gross := t_gross + a.gross;
  end loop;
  update quotations set net_total = t_net, vat_total = t_vat, gross_total = t_gross, updated_at = now(),
         customer_id = coalesce(nullif(p->>'customer_id', '')::uuid, customer_id),
         salesperson_id = coalesce(nullif(p->>'salesperson_id', '')::uuid, salesperson_id)
   where id = v_id;
  return jsonb_build_object('quotation_id', v_id, 'quote_no', v_no, 'gross_total', t_gross);
end;
$$;

-- Several quotations on one receipt: invoices.quotation_id keeps the first; this keeps them all.
create table if not exists public.invoice_quotations (
  invoice_id    uuid not null references public.invoices(id) on delete restrict,
  quotation_id  uuid not null references public.quotations(id) on delete restrict unique,
  primary key (invoice_id, quotation_id)
);
alter table public.invoice_quotations enable row level security;
revoke all on public.invoice_quotations from anon, authenticated;

-- post_sale_multi: like post_sale, but p.quotation_ids = [uuid, …] are all collected on this receipt.
create or replace function public.post_sale_multi(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r jsonb; q uuid; ids uuid[];
begin
  select array_agg(x::uuid) into ids from jsonb_array_elements_text(coalesce(p->'quotation_ids', '[]'::jsonb)) x;
  if ids is null or array_length(ids, 1) is null then return post_sale(p); end if;
  if exists (select 1 from invoices where client_id = (p->>'client_id')::uuid) then return post_sale(p); end if;
  foreach q in array ids loop
    if not exists (select 1 from quotations where id = q and status = 'open' and location_id = (p->>'location_id')::uuid) then
      raise exception 'This quotation is already collected or cancelled';
    end if;
  end loop;
  -- the receipt is linked to the first quotation; the others are marked collected here
  r := post_sale(jsonb_set(p, '{quotation_id}', to_jsonb(ids[1]::text)));
  if not (r->>'duplicate')::boolean then
    foreach q in array ids loop
      insert into invoice_quotations (invoice_id, quotation_id) values ((r->>'invoice_id')::uuid, q) on conflict do nothing;
      update quotations set status = 'collected', invoice_id = (r->>'invoice_id')::uuid where id = q;
    end loop;
  end if;
  return r;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['customer_balance(uuid)', 'post_cash_movement2(jsonb)', 'update_quotation(jsonb)', 'post_sale_multi(jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
