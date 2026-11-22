-- =====================================================================
-- 0027_recurring_expenses.sql — fixed costs that come back every month,
-- quarter, half-year or year (apartment / shop / warehouse rent, internet,
-- car instalment…), and every payment made for them.
--   recurring_expenses  what is paid, how much, how often, on which day, from when to when
--   expense_payments    each payment (one per expense per period; the period is
--                       the first day of the month it is due in)
-- The screens work out what is due / overdue from these. Only adds; re-runnable.
-- =====================================================================

create table if not exists public.recurring_expenses (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 1 and 120),
  expense_type_id uuid references public.expense_types(id) on delete set null,
  location_id     uuid references public.locations(id) on delete set null,
  payee           text check (payee is null or length(payee) <= 120),
  amount          numeric(12,2) not null check (amount > 0),
  frequency       text not null default 'monthly' check (frequency in ('monthly', 'quarterly', 'half_yearly', 'yearly')),
  due_day         int not null default 1 check (due_day between 1 and 28),
  start_on        date not null,
  end_on          date check (end_on is null or end_on >= start_on),
  method          text not null default 'bank' check (method in ('bank', 'cash', 'cheque', 'card', 'other')),
  notes           text not null default '' check (length(notes) <= 1000),
  active          boolean not null default true,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.expense_payments (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null unique,
  recurring_id    uuid references public.recurring_expenses(id) on delete restrict,
  period          date not null check (extract(day from period) = 1),
  paid_on         date not null default current_date,
  amount          numeric(12,2) not null check (amount > 0),
  method          text not null default 'bank' check (method in ('bank', 'cash', 'cheque', 'card', 'other')),
  ref             text check (ref is null or length(ref) <= 60),
  note            text not null default '' check (length(note) <= 500),
  location_id     uuid references public.locations(id) on delete set null,
  expense_type_id uuid references public.expense_types(id) on delete set null,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create unique index if not exists expense_payments_one_per_period on public.expense_payments (recurring_id, period) where recurring_id is not null;
create index if not exists expense_payments_paid_idx on public.expense_payments (paid_on);

-- rent and the other usual fixed costs as expense types
insert into public.expense_types (name_en, name_ar, sort) values
  ('Rent', 'إيجار', 6), ('Internet & phone', 'إنترنت واتصالات', 7), ('Car instalment', 'قسط سيارة', 8), ('Electricity & water', 'كهرباء ومياه', 8)
on conflict do nothing;

alter table public.recurring_expenses enable row level security;
alter table public.expense_payments enable row level security;
revoke all on public.recurring_expenses, public.expense_payments from anon, authenticated;
grant all on public.recurring_expenses, public.expense_payments to service_role;
