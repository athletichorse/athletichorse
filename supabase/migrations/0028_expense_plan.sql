-- =====================================================================
-- 0028_expense_plan.sql — expenses for the yearly plan:
--   * an expense can be "occasional" (once, on its date) besides monthly / 3 / 6 / 12 months
--   * amount_kind: 'fixed' (same every time) or 'variable' (the amount is an estimate;
--     the real amount is typed when paying)
--   * a payment can be a one-off expense with no recurring item (it then has a name)
-- Only adds / widens. Safe to run more than once.
-- =====================================================================

alter table public.recurring_expenses add column if not exists amount_kind text not null default 'fixed';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recurring_expenses_amount_kind_check') then
    alter table public.recurring_expenses add constraint recurring_expenses_amount_kind_check check (amount_kind in ('fixed', 'variable'));
  end if;
end $$;
alter table public.recurring_expenses drop constraint if exists recurring_expenses_frequency_check;
alter table public.recurring_expenses add constraint recurring_expenses_frequency_check check (frequency in ('monthly', 'quarterly', 'half_yearly', 'yearly', 'occasional'));

alter table public.expense_payments add column if not exists name text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expense_payments_named') then
    alter table public.expense_payments add constraint expense_payments_named
      check (recurring_id is not null or (name is not null and length(btrim(name)) between 1 and 120));
  end if;
end $$;
