-- =====================================================================
-- 0013_payroll.sql — salespeople, attendance, payroll, advances, commission.
--  * employees: pay settings for each staff member (salary, hours, commission).
--  * attendance: one row per person per day.
--  * advances (paid off monthly), bonuses and deductions.
--  * payroll month sheet: compute (while draft) → approve → pay (drawer or bank);
--    reopen with "edit salaries". One slip per employee.
--  * commission for a sales month, paid on the 15th of the next month: own
--    sales (or all salespeople's, for managers) × rate, plus regularity bonus
--    and food allowance.
-- Money rules live here (compute_payroll / compute_commission).
-- Only adds: safe to run more than once.
-- =====================================================================

create table if not exists public.employees (
  profile_id         uuid primary key references public.profiles(id),
  monthly_salary     numeric(12,2) not null default 0 check (monthly_salary >= 0),
  daily_hours        numeric(5,2) not null default 8 check (daily_hours > 0),
  commission_rate    numeric(8,6) not null default 0 check (commission_rate >= 0 and commission_rate < 1),  -- 6/1000 = 0.006
  commission_scope   text not null default 'own' check (commission_scope in ('own', 'all')),
  regularity_bonus   numeric(12,2) not null default 0 check (regularity_bonus >= 0),
  food_allowance     numeric(12,2) not null default 0 check (food_allowance >= 0),
  is_salesperson     boolean not null default true,
  bank_account       text not null default '',
  active             boolean not null default true,
  updated_at         timestamptz not null default now()
);

create table if not exists public.attendance (
  profile_id      uuid not null references public.profiles(id),
  day             date not null,
  status          text not null check (status in ('present', 'late', 'absent', 'unexcused', 'leave', 'off')),
  overtime_hours  numeric(5,2) not null default 0 check (overtime_hours >= 0),
  note            text not null default '',
  updated_by      uuid references public.profiles(id),
  updated_at      timestamptz not null default now(),
  primary key (profile_id, day)
);

create table if not exists public.advances (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null unique,
  profile_id      uuid not null references public.profiles(id),
  amount          numeric(12,2) not null check (amount > 0),
  installment     numeric(12,2) not null check (installment > 0),     -- taken from each salary
  given_on        date not null default ((now() at time zone 'Asia/Riyadh')::date),
  note            text not null default '',
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now()
);

create table if not exists public.pay_adjustments (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null unique,
  profile_id  uuid not null references public.profiles(id),
  month       date not null check (extract(day from month) = 1),
  kind        text not null check (kind in ('bonus', 'deduction')),
  amount      numeric(12,2) not null check (amount > 0),
  note        text not null default '',
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

create table if not exists public.payroll_months (
  month        date primary key check (extract(day from month) = 1),
  status       text not null default 'draft' check (status in ('draft', 'approved', 'paid')),
  approved_by  uuid references public.profiles(id),
  approved_at  timestamptz,
  updated_at   timestamptz not null default now()
);

create table if not exists public.payroll_lines (
  month               date not null references public.payroll_months(month),
  profile_id          uuid not null references public.profiles(id),
  base                numeric(12,2) not null default 0,
  days_present        integer not null default 0,
  lates               integer not null default 0,
  late_deduction      numeric(12,2) not null default 0,
  absences            integer not null default 0,
  unexcused           integer not null default 0,
  absence_deduction   numeric(12,2) not null default 0,
  overtime_hours      numeric(7,2) not null default 0,
  overtime_pay        numeric(12,2) not null default 0,
  bonuses             numeric(12,2) not null default 0,
  deductions          numeric(12,2) not null default 0,
  advance_deduction   numeric(12,2) not null default 0,
  advance_left        numeric(12,2) not null default 0,
  net                 numeric(12,2) not null default 0,
  paid_via            text check (paid_via is null or paid_via in ('drawer', 'bank')),
  paid_at             timestamptz,
  primary key (month, profile_id)
);

create table if not exists public.commission_months (
  month        date primary key check (extract(day from month) = 1),   -- the SALES month; paid on the 15th of the next
  status       text not null default 'draft' check (status in ('draft', 'approved', 'paid')),
  approved_by  uuid references public.profiles(id),
  approved_at  timestamptz,
  updated_at   timestamptz not null default now()
);

create table if not exists public.commission_lines (
  month             date not null references public.commission_months(month),
  profile_id        uuid not null references public.profiles(id),
  scope             text not null,
  sales             numeric(12,2) not null default 0,     -- net of VAT and returns
  rate              numeric(8,6) not null default 0,
  commission        numeric(12,2) not null default 0,
  regularity_bonus  numeric(12,2) not null default 0,
  food_allowance    numeric(12,2) not null default 0,
  total             numeric(12,2) not null default 0,
  paid_via          text check (paid_via is null or paid_via in ('drawer', 'bank')),
  paid_at           timestamptz,
  primary key (month, profile_id)
);

alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.advances enable row level security;
alter table public.pay_adjustments enable row level security;
alter table public.payroll_months enable row level security;
alter table public.payroll_lines enable row level security;
alter table public.commission_months enable row level security;
alter table public.commission_lines enable row level security;
revoke all on public.employees, public.attendance, public.advances, public.pay_adjustments, public.payroll_months, public.payroll_lines, public.commission_months, public.commission_lines from anon, authenticated;

-- Drawer payouts are expenses of these types.
insert into public.expense_types (name_en, name_ar, sort) values
  ('Salaries', 'رواتب', 20), ('Commission', 'عمولات', 21), ('Staff advances', 'سلف الموظفين', 22)
on conflict do nothing;

-- Setting helpers
create or replace function public.setting_num(p_key text, p_default numeric)
returns numeric language sql stable set search_path = public as $$
  select coalesce((select (value #>> '{}')::numeric from settings where key = p_key), p_default);
$$;

-- ---------------------------------------------------------------------
-- compute_payroll(month): (re)builds the draft sheet from attendance,
-- adjustments and advances. Refused once approved or paid.
--   day rate = monthly salary / 30; hourly = day rate / daily hours
--   late arrivals over the allowance cost late_day_value days each
--   an absence costs absence_days; an unexcused absence costs unexcused_absence_days
--   overtime = hours × hourly × overtime_rate
--   advances: the installment (or what is left) is taken each month
-- ---------------------------------------------------------------------
create or replace function public.compute_payroll(p_month date, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e record; v_status text; v_end date := (p_month + interval '1 month')::date;
  v_allowed numeric := setting_num('late_allowed', 3); v_late_day numeric := setting_num('late_day_value', 0.25);
  v_abs_days numeric := setting_num('absence_days', 1); v_unex_days numeric := setting_num('unexcused_absence_days', 2);
  v_ot numeric := setting_num('overtime_rate', 1);
  v_day numeric; v_hour numeric; v_lates int; v_abs int; v_unex int; v_present int; v_ot_h numeric;
  v_bonus numeric; v_ded numeric; v_owed numeric; v_inst numeric; v_adv numeric; n int := 0;
  l_late numeric; l_abs numeric; l_ot numeric; l_net numeric;
begin
  if extract(day from p_month) <> 1 then raise exception 'bad_month'; end if;
  insert into payroll_months (month) values (p_month) on conflict do nothing;
  select status into v_status from payroll_months where month = p_month for update;
  if v_status <> 'draft' then raise exception 'payroll_locked'; end if;
  for e in select * from employees where active loop
    v_day := e.monthly_salary / 30; v_hour := v_day / e.daily_hours;
    select count(*) filter (where status = 'late'), count(*) filter (where status = 'absent'), count(*) filter (where status = 'unexcused'),
           count(*) filter (where status in ('present', 'late')), coalesce(sum(overtime_hours), 0)
      into v_lates, v_abs, v_unex, v_present, v_ot_h
      from attendance where profile_id = e.profile_id and day >= p_month and day < v_end;
    select coalesce(sum(amount) filter (where kind = 'bonus'), 0), coalesce(sum(amount) filter (where kind = 'deduction'), 0)
      into v_bonus, v_ded from pay_adjustments where profile_id = e.profile_id and month = p_month;
    -- advances still owed (given up to the end of this month, minus what earlier months took)
    v_owed := coalesce((select sum(amount) from advances where profile_id = e.profile_id and given_on < v_end), 0)
            - coalesce((select sum(advance_deduction) from payroll_lines where profile_id = e.profile_id and month < p_month), 0);
    v_inst := coalesce((select sum(installment) from advances where profile_id = e.profile_id and given_on < v_end), 0);
    v_adv := greatest(0, least(v_owed, v_inst));
    l_late := round(greatest(0, v_lates - v_allowed) * v_late_day * v_day, 2);
    l_abs := round((v_abs * v_abs_days + v_unex * v_unex_days) * v_day, 2);
    l_ot := round(v_ot_h * v_hour * v_ot, 2);
    l_net := e.monthly_salary - l_late - l_abs + l_ot + v_bonus - v_ded - v_adv;
    insert into payroll_lines (month, profile_id, base, days_present, lates, late_deduction, absences, unexcused, absence_deduction,
                               overtime_hours, overtime_pay, bonuses, deductions, advance_deduction, advance_left, net)
    values (p_month, e.profile_id, e.monthly_salary, v_present, v_lates, l_late, v_abs, v_unex, l_abs, v_ot_h, l_ot, v_bonus, v_ded,
            v_adv, greatest(0, v_owed - v_adv), l_net)
    on conflict (month, profile_id) do update set
      base = excluded.base, days_present = excluded.days_present, lates = excluded.lates, late_deduction = excluded.late_deduction,
      absences = excluded.absences, unexcused = excluded.unexcused, absence_deduction = excluded.absence_deduction,
      overtime_hours = excluded.overtime_hours, overtime_pay = excluded.overtime_pay, bonuses = excluded.bonuses,
      deductions = excluded.deductions, advance_deduction = excluded.advance_deduction, advance_left = excluded.advance_left, net = excluded.net;
    n := n + 1;
  end loop;
  update payroll_months set updated_at = now() where month = p_month;
  insert into audit_log (user_id, action, entity, entity_id, details) values (p_user, 'payroll.compute', 'payroll', p_month::text, jsonb_build_object('employees', n));
  return jsonb_build_object('employees', n);
end;
$$;

-- ---------------------------------------------------------------------
-- compute_commission(month): sales month → commission sheet (draft only).
--   own: the person's own sales (receipts with them as salesperson)
--   all: every salesperson's sales (managers)
--   sales are before VAT, returns subtracted; commission = sales × rate
--   regularity bonus: no absence of any kind and lates within the allowance
-- ---------------------------------------------------------------------
create or replace function public.compute_commission(p_month date, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare e record; v_status text; v_end date := (p_month + interval '1 month')::date; v_from timestamptz; v_to timestamptz;
        v_sales numeric; v_regular boolean; v_allowed numeric := setting_num('late_allowed', 3); v_com numeric; v_reg numeric; n int := 0;
begin
  if extract(day from p_month) <> 1 then raise exception 'bad_month'; end if;
  insert into commission_months (month) values (p_month) on conflict do nothing;
  select status into v_status from commission_months where month = p_month for update;
  if v_status <> 'draft' then raise exception 'commission_locked'; end if;
  v_from := (p_month::timestamp at time zone 'Asia/Riyadh'); v_to := (v_end::timestamp at time zone 'Asia/Riyadh');
  for e in select * from employees where active and (commission_rate > 0 or regularity_bonus > 0 or food_allowance > 0) loop
    select coalesce(sum(case when i.kind = 'invoice' then i.net_total else -i.net_total end), 0) into v_sales
      from invoices i
     where i.issued_at >= v_from and i.issued_at < v_to
       and (case when e.commission_scope = 'all'
                 then i.salesperson_id in (select profile_id from employees where is_salesperson)
                 else i.salesperson_id = e.profile_id end);
    v_regular := not exists (select 1 from attendance where profile_id = e.profile_id and day >= p_month and day < v_end and status in ('absent', 'unexcused'))
             and (select count(*) from attendance where profile_id = e.profile_id and day >= p_month and day < v_end and status = 'late') <= v_allowed;
    v_com := round(greatest(v_sales, 0) * e.commission_rate, 2);
    v_reg := case when v_regular then e.regularity_bonus else 0 end;
    insert into commission_lines (month, profile_id, scope, sales, rate, commission, regularity_bonus, food_allowance, total)
    values (p_month, e.profile_id, e.commission_scope, v_sales, e.commission_rate, v_com, v_reg, e.food_allowance, v_com + v_reg + e.food_allowance)
    on conflict (month, profile_id) do update set scope = excluded.scope, sales = excluded.sales, rate = excluded.rate,
      commission = excluded.commission, regularity_bonus = excluded.regularity_bonus, food_allowance = excluded.food_allowance, total = excluded.total;
    n := n + 1;
  end loop;
  update commission_months set updated_at = now() where month = p_month;
  insert into audit_log (user_id, action, entity, entity_id, details) values (p_user, 'commission.compute', 'commission', p_month::text, jsonb_build_object('employees', n));
  return jsonb_build_object('employees', n);
end;
$$;

-- Approve / reopen / pay a sheet (p_sheet: 'payroll' | 'commission').
create or replace function public.set_pay_sheet_status(p_sheet text, p_month date, p_status text, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_old text;
begin
  if p_status not in ('draft', 'approved') then raise exception 'bad_status'; end if;
  if p_sheet = 'payroll' then
    select status into v_old from payroll_months where month = p_month for update;
    if v_old is null then raise exception 'not_found'; end if;
    if p_status = 'draft' and exists (select 1 from payroll_lines where month = p_month and paid_at is not null) then raise exception 'already_paid'; end if;
    update payroll_months set status = p_status, approved_by = case when p_status = 'approved' then p_user end,
           approved_at = case when p_status = 'approved' then now() end, updated_at = now() where month = p_month;
  elsif p_sheet = 'commission' then
    select status into v_old from commission_months where month = p_month for update;
    if v_old is null then raise exception 'not_found'; end if;
    if p_status = 'draft' and exists (select 1 from commission_lines where month = p_month and paid_at is not null) then raise exception 'already_paid'; end if;
    update commission_months set status = p_status, approved_by = case when p_status = 'approved' then p_user end,
           approved_at = case when p_status = 'approved' then now() end, updated_at = now() where month = p_month;
  else raise exception 'bad_sheet'; end if;
  insert into audit_log (user_id, action, entity, entity_id, details) values (p_user, p_sheet || '.' || p_status, p_sheet, p_month::text, '{}');
  return jsonb_build_object('status', p_status);
end;
$$;

-- Pay one person's line from the drawer (an expense in an open shift) or the bank. Approved sheets only; once.
create or replace function public.pay_sheet_line(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_sheet text := p->>'sheet'; v_month date := (p->>'month')::date; v_who uuid := (p->>'profile_id')::uuid;
        v_via text := p->>'via'; v_amt numeric; v_status text; v_paid timestamptz; v_type uuid; v_name text;
begin
  if v_via not in ('drawer', 'bank') then raise exception 'bad_request'; end if;
  if v_sheet = 'payroll' then
    select m.status, l.net, l.paid_at into v_status, v_amt, v_paid from payroll_lines l join payroll_months m on m.month = l.month where l.month = v_month and l.profile_id = v_who for update of l;
  elsif v_sheet = 'commission' then
    select m.status, l.total, l.paid_at into v_status, v_amt, v_paid from commission_lines l join commission_months m on m.month = l.month where l.month = v_month and l.profile_id = v_who for update of l;
  else raise exception 'bad_sheet'; end if;
  if v_status is null then raise exception 'not_found'; end if;
  if v_paid is not null then return jsonb_build_object('duplicate', true); end if;
  if v_status = 'draft' then raise exception 'not_approved'; end if;
  if v_via = 'drawer' and v_amt > 0 then
    select id into v_type from expense_types where name_en = case when v_sheet = 'payroll' then 'Salaries' else 'Commission' end;
    select full_name into v_name from profiles where id = v_who;
    perform post_cash_movement2(jsonb_build_object('client_id', p->>'client_id', 'shift_id', p->>'shift_id', 'kind', 'expense', 'amount', v_amt,
             'reason', v_name || ' · ' || to_char(v_month, 'YYYY-MM'), 'user_id', p->>'user_id', 'expense_type_id', v_type));
  end if;
  if v_sheet = 'payroll' then
    update payroll_lines set paid_via = v_via, paid_at = now() where month = v_month and profile_id = v_who;
    if not exists (select 1 from payroll_lines where month = v_month and paid_at is null) then update payroll_months set status = 'paid', updated_at = now() where month = v_month; end if;
  else
    update commission_lines set paid_via = v_via, paid_at = now() where month = v_month and profile_id = v_who;
    if not exists (select 1 from commission_lines where month = v_month and paid_at is null) then update commission_months set status = 'paid', updated_at = now() where month = v_month; end if;
  end if;
  insert into audit_log (user_id, action, entity, entity_id, details)
  values ((p->>'user_id')::uuid, v_sheet || '.pay', v_sheet, v_month::text, jsonb_build_object('profile', v_who, 'via', v_via, 'amount', v_amt));
  return jsonb_build_object('duplicate', false, 'amount', v_amt);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['setting_num(text,numeric)', 'compute_payroll(date,uuid)', 'compute_commission(date,uuid)', 'set_pay_sheet_status(text,date,text,uuid)', 'pay_sheet_line(jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
