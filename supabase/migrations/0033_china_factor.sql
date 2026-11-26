-- =====================================================================
-- 0033_china_factor.sql — China orders use the owner's landed rate (سعر التضريب):
--   ratio  = (container in yuan + fees in yuan) ÷ container in yuan   (fees typed in SAR ÷ rate)
--   rate   = ratio × yuan→SAR rate (the rate actually paid when typed)
--   landed price per piece (SAR) = price in yuan × rate — the same rate for every item
-- (before: shipping was spread by CBM). Only replaces save_china_order. Safe to run more than once.
-- =====================================================================

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
  l jsonb; n int := 0; m int := 0; v_qty numeric; v_goods numeric; v_cbm numeric; v_tot_goods numeric := 0; v_tot_cbm numeric := 0; v_landed numeric; v_ratio numeric;
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

  v_ratio := case when v_tot_goods > 0 then (v_tot_goods + (v_ship + v_cust + v_other) / v_eff) / v_tot_goods else 1 end;

  for l in select * from jsonb_array_elements(p->'lines') loop
    n := n + 1;
    v_qty := coalesce(nullif(l->>'cartons', '')::numeric, 0) * coalesce(nullif(l->>'per_carton', '')::numeric, 1);
    v_goods := v_qty * coalesce(nullif(l->>'unit_price', '')::numeric, 0);
    v_cbm := coalesce(nullif(l->>'cartons', '')::numeric, 0) * coalesce(nullif(l->>'carton_cbm', '')::numeric, 0);
    -- the owner's landed rate: (container ¥ + fees in ¥) ÷ container ¥ × rate; price in SAR = price in ¥ × that rate
    v_landed := case when v_qty > 0 then v_goods * v_eff * v_ratio / v_qty end;
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
