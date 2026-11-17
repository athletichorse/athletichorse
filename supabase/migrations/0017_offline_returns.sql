-- 0017: returns made at the till without internet.
-- post_return now takes the time the return happened (issued_at) and its temporary number
-- (offline_temp_no), the same way post_sale does. Re-runnable (create or replace).

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
  v_lines jsonb := '[]'::jsonb; v_issued timestamptz;
begin
  select id, number into v_existing from invoices where client_id = (p->>'client_id')::uuid;
  if found then return jsonb_build_object('invoice_id', v_existing.id, 'number', v_existing.number, 'duplicate', true); end if;
  if v_shift is null or not exists (select 1 from pos_shifts where id = v_shift and status = 'open' and location_id = v_loc) then
    raise exception 'Open a shift at this location before a return';
  end if;
  if jsonb_array_length(coalesce(p->'lines', '[]'::jsonb)) = 0 then raise exception 'Choose at least one item to return'; end if;
  -- offline returns keep the time they happened (never in the future, never older than 7 days)
  v_issued := least(now(), greatest(coalesce(nullif(p->>'issued_at', '')::timestamptz, now()), now() - interval '7 days'));
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
                           v_issued, v_rate, t_net, t_vat, t_gross, 0, null, 0, nullif(p->>'offline_temp_no', ''), nullif(p->>'approved_by', '')::uuid);

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


revoke all on function public.post_return(jsonb) from public, anon, authenticated;
grant execute on function public.post_return(jsonb) to service_role;
