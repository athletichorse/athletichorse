-- =====================================================================
-- 0032_china_orders.sql — China (container) orders.
-- A China order is a purchase order of kind 'china', in CNY, with:
--   title, container (20ft / 40ft / 40hc), order rate (SAR per CNY) and the
--   rate actually paid, and fees in SAR: shipping, customs clearance, other.
-- Its lines (china_order_lines) are the supplier's sheet: code, description,
-- cartons × pieces per carton, price per piece (CNY), CBM per carton, and the
-- portal item it is linked to. Landed cost per piece (SAR) =
--   (price × rate actually paid, or the order rate)
--   + shipping spread by the line's CBM + customs and other fees by its value.
-- Linked lines become the purchase order's lines; receiving them sets each
-- item's cost from its landed cost. Status adds 'shipped'.
-- Only adds / widens. Safe to run more than once.
-- =====================================================================

alter table public.purchase_orders add column if not exists kind text not null default 'standard';
alter table public.purchase_orders add column if not exists title text;
alter table public.purchase_orders add column if not exists container text;
alter table public.purchase_orders add column if not exists rate_paid numeric(14,6);
alter table public.purchase_orders add column if not exists fee_shipping numeric(14,2) not null default 0;
alter table public.purchase_orders add column if not exists fee_customs numeric(14,2) not null default 0;
alter table public.purchase_orders add column if not exists fee_other numeric(14,2) not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'purchase_orders_kind_check2') then
    alter table public.purchase_orders add constraint purchase_orders_kind_check2 check (kind in ('standard', 'china'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchase_orders_container_check') then
    alter table public.purchase_orders add constraint purchase_orders_container_check check (container is null or container in ('20ft', '40ft', '40hc'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchase_orders_china_money_check') then
    alter table public.purchase_orders add constraint purchase_orders_china_money_check
      check ((rate_paid is null or rate_paid > 0) and fee_shipping >= 0 and fee_customs >= 0 and fee_other >= 0 and (title is null or length(title) <= 120));
  end if;
end $$;
alter table public.purchase_orders drop constraint if exists purchase_orders_status_check;
alter table public.purchase_orders add constraint purchase_orders_status_check check (status in ('draft', 'ordered', 'shipped', 'partial', 'received', 'cancelled'));
-- a China order may not have a supplier yet
alter table public.purchase_orders alter column supplier_id drop not null;
alter table public.purchase_receipts alter column supplier_id drop not null;

alter table public.purchase_order_lines add column if not exists landed_unit_sar numeric(14,4);

create table if not exists public.china_order_lines (
  order_id      uuid not null references public.purchase_orders(id) on delete cascade,
  line_no       int not null,
  supplier_code text check (supplier_code is null or length(supplier_code) <= 60),
  description   text not null default '' check (length(description) <= 300),
  variant_id    uuid references public.product_variants(id),
  cartons       numeric(10,2) not null default 0 check (cartons >= 0),
  per_carton    int not null default 1 check (per_carton between 1 and 100000),
  unit_price    numeric(14,4) not null default 0 check (unit_price >= 0),
  carton_cbm    numeric(10,4) not null default 0 check (carton_cbm >= 0),
  image_url     text check (image_url is null or length(image_url) <= 500),
  landed_unit_sar numeric(14,4),
  po_line_no    int,
  primary key (order_id, line_no)
);
alter table public.china_order_lines enable row level security;
revoke all on public.china_order_lines from anon, authenticated;
grant all on public.china_order_lines to service_role;

-- save_china_order(p): create, or change while nothing has been received.
-- p: {id?, client_id, supplier_id?, location_id, title, container, rate, rate_paid?, fee_shipping, fee_customs, fee_other,
--     status ('draft'|'ordered'|'shipped'), notes, user_id,
--     lines:[{supplier_code, description, variant_id?, cartons, per_carton, unit_price, carton_cbm, image_url}]}
create or replace function public.save_china_order(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid; v_no bigint; v_status text := coalesce(nullif(p->>'status', ''), 'draft');
  v_rate numeric := (p->>'rate')::numeric; v_paid numeric := nullif(p->>'rate_paid', '')::numeric; v_eff numeric;
  v_ship numeric := coalesce(nullif(p->>'fee_shipping', '')::numeric, 0); v_cust numeric := coalesce(nullif(p->>'fee_customs', '')::numeric, 0);
  v_other numeric := coalesce(nullif(p->>'fee_other', '')::numeric, 0);
  l jsonb; n int := 0; m int := 0; v_qty numeric; v_goods numeric; v_cbm numeric; v_tot_goods numeric := 0; v_tot_cbm numeric := 0; v_landed numeric;
begin
  if v_status not in ('draft', 'ordered', 'shipped') then raise exception 'bad_status'; end if;
  if v_rate is null or v_rate <= 0 or (v_paid is not null and v_paid <= 0) then raise exception 'bad_rate'; end if;
  if v_ship < 0 or v_cust < 0 or v_other < 0 then raise exception 'bad_cost'; end if;
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then raise exception 'no_lines'; end if;
  if nullif(p->>'supplier_id', '') is not null and not exists (select 1 from suppliers where id = (p->>'supplier_id')::uuid) then raise exception 'bad_supplier'; end if;
  v_eff := coalesce(v_paid, v_rate);

  if v_id is null then
    select id, po_no into v_id, v_no from purchase_orders where client_id = (p->>'client_id')::uuid;
    if found then return jsonb_build_object('id', v_id, 'po_no', v_no, 'duplicate', true); end if;
    insert into purchase_orders (client_id, kind, supplier_id, location_id, currency, rate, rate_paid, status, title, container, fee_shipping, fee_customs, fee_other, notes, created_by)
    values ((p->>'client_id')::uuid, 'china', nullif(p->>'supplier_id', '')::uuid, (p->>'location_id')::uuid, 'CNY', v_rate, v_paid, v_status,
            nullif(btrim(p->>'title'), ''), nullif(p->>'container', ''), v_ship, v_cust, v_other, coalesce(p->>'notes', ''), nullif(p->>'user_id', '')::uuid)
    returning id, po_no into v_id, v_no;
  else
    select po_no into v_no from purchase_orders where id = v_id and kind = 'china' and status in ('draft', 'ordered', 'shipped') for update;
    if not found then raise exception 'locked'; end if;
    if exists (select 1 from purchase_receipts where order_id = v_id) then raise exception 'locked'; end if;
    update purchase_orders set supplier_id = nullif(p->>'supplier_id', '')::uuid, location_id = (p->>'location_id')::uuid, rate = v_rate, rate_paid = v_paid,
           status = v_status, title = nullif(btrim(p->>'title'), ''), container = nullif(p->>'container', ''),
           fee_shipping = v_ship, fee_customs = v_cust, fee_other = v_other, notes = coalesce(p->>'notes', ''), updated_at = now()
     where id = v_id;
    delete from china_order_lines where order_id = v_id;
    delete from purchase_order_lines where order_id = v_id;
  end if;

  -- totals first (to spread the fees)
  for l in select * from jsonb_array_elements(p->'lines') loop
    v_qty := coalesce(nullif(l->>'cartons', '')::numeric, 0) * coalesce(nullif(l->>'per_carton', '')::numeric, 1);
    v_tot_goods := v_tot_goods + v_qty * coalesce(nullif(l->>'unit_price', '')::numeric, 0);
    v_tot_cbm := v_tot_cbm + coalesce(nullif(l->>'cartons', '')::numeric, 0) * coalesce(nullif(l->>'carton_cbm', '')::numeric, 0);
  end loop;

  for l in select * from jsonb_array_elements(p->'lines') loop
    n := n + 1;
    v_qty := coalesce(nullif(l->>'cartons', '')::numeric, 0) * coalesce(nullif(l->>'per_carton', '')::numeric, 1);
    v_goods := v_qty * coalesce(nullif(l->>'unit_price', '')::numeric, 0);
    v_cbm := coalesce(nullif(l->>'cartons', '')::numeric, 0) * coalesce(nullif(l->>'carton_cbm', '')::numeric, 0);
    v_landed := case when v_qty > 0 then
      (v_goods * v_eff
       + case when v_tot_cbm > 0 then v_ship * v_cbm / v_tot_cbm when v_tot_goods > 0 then v_ship * v_goods / v_tot_goods else 0 end
       + case when v_tot_goods > 0 then (v_cust + v_other) * v_goods / v_tot_goods else 0 end) / v_qty end;
    if nullif(l->>'variant_id', '') is not null and not exists (select 1 from product_variants pv join products pr on pr.id = pv.product_id where pv.id = (l->>'variant_id')::uuid and not pr.is_service) then
      raise exception 'bad_item';
    end if;
    if nullif(l->>'variant_id', '') is not null and v_qty > 0 then
      m := m + 1;
      insert into purchase_order_lines (order_id, line_no, variant_id, qty, unit_cost, landed_unit_sar)
      values (v_id, m, (l->>'variant_id')::uuid, v_qty, coalesce(nullif(l->>'unit_price', '')::numeric, 0), round(v_landed, 4));
    end if;
    insert into china_order_lines (order_id, line_no, supplier_code, description, variant_id, cartons, per_carton, unit_price, carton_cbm, image_url, landed_unit_sar, po_line_no)
    values (v_id, n, nullif(left(btrim(coalesce(l->>'supplier_code', '')), 60), ''), left(coalesce(l->>'description', ''), 300), nullif(l->>'variant_id', '')::uuid,
            coalesce(nullif(l->>'cartons', '')::numeric, 0), greatest(1, coalesce(nullif(l->>'per_carton', '')::int, 1)), coalesce(nullif(l->>'unit_price', '')::numeric, 0),
            coalesce(nullif(l->>'carton_cbm', '')::numeric, 0), nullif(l->>'image_url', ''), round(v_landed, 4),
            case when nullif(l->>'variant_id', '') is not null and v_qty > 0 then m end);
  end loop;
  update purchase_orders set total = round(v_tot_goods, 2) where id = v_id;
  return jsonb_build_object('id', v_id, 'po_no', v_no, 'duplicate', false, 'linked', m, 'lines', n);
end;
$$;
revoke all on function public.save_china_order(jsonb) from public, anon, authenticated;
grant execute on function public.save_china_order(jsonb) to service_role;

-- receiving: also from 'shipped'; cost = landed cost when the line has one; owed at the rate actually paid
create or replace function public.receive_purchase(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o purchase_orders; l jsonb; ln purchase_order_lines; v_qty numeric; v_rid uuid; v_doc jsonb; n int := 0;
  v_amount numeric := 0; v_lines jsonb := '[]'::jsonb; v_have numeric; v_old numeric; v_new_cost numeric; v_rate numeric;
begin
  select id into v_rid from purchase_receipts where client_id = (p->>'client_id')::uuid;
  if found then return jsonb_build_object('receipt_id', v_rid, 'duplicate', true); end if;
  select * into o from purchase_orders where id = (p->>'order_id')::uuid for update;
  if not found then raise exception 'not_found'; end if;
  if o.status not in ('ordered', 'shipped', 'partial', 'draft') then raise exception 'locked'; end if;
  if jsonb_typeof(p->'lines') <> 'array' then raise exception 'no_lines'; end if;
  v_rate := coalesce(o.rate_paid, o.rate);

  insert into purchase_receipts (client_id, order_id, supplier_id, bill_no, received_on, currency, rate, amount, amount_sar, created_by)
  values ((p->>'client_id')::uuid, o.id, o.supplier_id, nullif(p->>'bill_no', ''), coalesce(nullif(p->>'received_on', '')::date, current_date),
          o.currency, v_rate, 0, 0, nullif(p->>'user_id', '')::uuid)
  returning id into v_rid;

  for l in select * from jsonb_array_elements(p->'lines') loop
    v_qty := coalesce(nullif(l->>'qty', '')::numeric, 0);
    continue when v_qty = 0;
    if v_qty < 0 then raise exception 'bad_qty'; end if;
    select * into ln from purchase_order_lines where order_id = o.id and line_no = (l->>'line_no')::int for update;
    if not found then raise exception 'bad_line'; end if;
    if ln.received_qty + v_qty > ln.qty then raise exception 'too_many'; end if;
    -- average cost in SAR, using the stock before this receipt (landed cost for China orders)
    v_have := greatest(coalesce((select sum(qty) from stock_levels where variant_id = ln.variant_id), 0), 0);
    v_old := coalesce((select cost from product_variants where id = ln.variant_id), 0);
    v_new_cost := round(((v_have * v_old) + (v_qty * coalesce(ln.landed_unit_sar, ln.unit_cost * v_rate))) / (v_have + v_qty), 2);
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
  update purchase_receipts set stock_doc_id = (v_doc->>'doc_id')::uuid, amount = v_amount, amount_sar = round(v_amount * v_rate, 2) where id = v_rid;
  update purchase_orders set updated_at = now(),
         status = case when exists (select 1 from purchase_order_lines where order_id = o.id and received_qty < qty) then 'partial' else 'received' end
   where id = o.id;
  return jsonb_build_object('receipt_id', v_rid, 'doc_no', v_doc->>'doc_no', 'amount', v_amount, 'duplicate', false);
end;
$$;
revoke all on function public.receive_purchase(jsonb) from public, anon, authenticated;
grant execute on function public.receive_purchase(jsonb) to service_role;
