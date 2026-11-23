-- =====================================================================
-- 0030_drawer_supplier_payment.sql — the cashier can pay a supplier from the
-- drawer: expense type "Supplier payment" + the supplier. It leaves the drawer
-- like any expense, and it is also a payment on the supplier's account (it
-- lowers what we owe them; shown on their statement).
-- Only adds; post_cash_movement2 / shift report unchanged for other kinds.
-- Safe to run more than once.
-- =====================================================================

alter table public.expense_types add column if not exists is_supplier boolean not null default false;
insert into public.expense_types (name_en, name_ar, sort, is_supplier) values ('Supplier payment', 'دفعة لمورد', 0, true)
on conflict ((lower(name_en))) do update set is_supplier = true;

alter table public.drawer_entries add column if not exists supplier_id uuid references public.suppliers(id);
alter table public.supplier_payments add column if not exists drawer_entry_id uuid unique references public.drawer_entries(id);
create index if not exists drawer_entries_supplier_idx on public.drawer_entries (supplier_id) where supplier_id is not null;

create or replace function public.post_cash_movement2(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_kind text := p->>'kind'; v_sup uuid := nullif(p->>'supplier_id', '')::uuid; v_is_sup boolean := false;
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
  if v_kind = 'expense' then
    select is_supplier into v_is_sup from expense_types where id = (p->>'expense_type_id')::uuid;
    if coalesce(v_is_sup, false) then
      if v_sup is null or not exists (select 1 from suppliers where id = v_sup and active) then raise exception 'supplier_required'; end if;
    else
      v_sup := null;
    end if;
  end if;
  if v_kind in ('cash_out', 'cash_in') then
    insert into cash_movements (client_id, shift_id, kind, amount, reason, created_by, approved_by)
    values ((p->>'client_id')::uuid, (p->>'shift_id')::uuid, v_kind, (p->>'amount')::numeric(12,2), coalesce(p->>'reason', ''),
            (p->>'user_id')::uuid, nullif(p->>'approved_by', '')::uuid)
    returning id into v_id;
  else
    insert into drawer_entries (client_id, shift_id, kind, amount, reason, created_by, approved_by, expense_type_id, customer_id, method, supplier_id)
    values ((p->>'client_id')::uuid, (p->>'shift_id')::uuid, v_kind, (p->>'amount')::numeric(12,2), coalesce(p->>'reason', ''),
            (p->>'user_id')::uuid, nullif(p->>'approved_by', '')::uuid,
            case when v_kind = 'expense' then nullif(p->>'expense_type_id', '')::uuid end,
            case when v_kind = 'customer_payment' then nullif(p->>'customer_id', '')::uuid end,
            case when v_kind = 'customer_payment' then coalesce(nullif(p->>'method', ''), 'cash') end,
            v_sup)
    returning id into v_id;
    -- paid to a supplier from the drawer: also a payment on the supplier's account (cash, SAR)
    if v_sup is not null then
      insert into supplier_payments (client_id, supplier_id, paid_on, currency, rate, amount, amount_sar, method, ref, note, created_by, drawer_entry_id)
      values (gen_random_uuid(), v_sup, (now() at time zone 'Asia/Riyadh')::date, 'SAR', 1, (p->>'amount')::numeric(12,2), (p->>'amount')::numeric(12,2),
              'cash', 'POS', left(coalesce(p->>'reason', ''), 500), (p->>'user_id')::uuid, v_id);
    end if;
  end if;
  return jsonb_build_object('id', v_id, 'duplicate', false);
end;
$$;
revoke all on function public.post_cash_movement2(jsonb) from public, anon, authenticated;
grant execute on function public.post_cash_movement2(jsonb) to service_role;
