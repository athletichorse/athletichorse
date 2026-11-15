-- =====================================================================
-- 0001_core.sql — company settings, locations, staff profiles,
--                 permissions, payment methods, seed data.
-- Safe to run more than once (if not exists / create or replace /
-- on conflict do nothing).
-- Run in: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Settings (key/value). VAT rate lives here — never hard-coded.
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Company (exactly one row, id = 1)
-- ---------------------------------------------------------------------
create table if not exists public.company (
  id             smallint primary key default 1 check (id = 1),
  legal_name_ar  text not null default '',
  legal_name_en  text not null default '',
  -- 15 digits, starts and ends with 3. Empty until the owner fills it in.
  vat_number     text check (vat_number is null or vat_number ~ '^3[0-9]{13}3$'),
  cr_number      text check (cr_number is null or cr_number ~ '^[0-9]{10}$'),
  address_ar     text not null default '',
  address_en     text not null default '',
  logo_url       text,
  updated_at     timestamptz not null default now()
);

drop trigger if exists company_touch on public.company;
create trigger company_touch before update on public.company
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Locations: branches, warehouses, sub-stores
-- ---------------------------------------------------------------------
create table if not exists public.locations (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z0-9_-]{2,20}$'),
  name_ar     text not null,
  name_en     text not null default '',
  kind        text not null check (kind in ('branch', 'warehouse', 'sub_store')),
  parent_id   uuid references public.locations(id) on delete restrict,
  uses_pos    boolean not null default false,
  address_ar  text not null default '',
  address_en  text not null default '',
  phone       text check (phone is null or phone ~ '^\+9665[0-9]{8}$|^\+966[1-9][0-9]{7}$'),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint locations_sub_store_has_parent
    check ((kind = 'sub_store') = (parent_id is not null)),
  constraint locations_not_own_parent
    check (parent_id is null or parent_id <> id)
);

create index if not exists locations_parent_idx on public.locations(parent_id);

drop trigger if exists locations_touch on public.locations;
create trigger locations_touch before update on public.locations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Staff profiles (1:1 with auth.users)
-- Role list must match ROLES in src/lib/permissions.ts (a test checks).
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique check (username ~ '^[a-z0-9._-]{3,32}$'),
  full_name   text not null,
  role        text not null check (role in
                ('owner','manager','accountant','warehouse','cashier','pos','cashier_pos','marketing')),
  branch_id   uuid references public.locations(id) on delete set null,
  locale      text not null default 'ar' check (locale in ('ar', 'en')),
  phone       text check (phone is null or phone ~ '^\+9665[0-9]{8}$'),
  active      boolean not null default true,
  -- Manager approval PIN, bcrypt hash (never the PIN itself).
  pin_hash    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists profiles_branch_idx on public.profiles(branch_id);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Permission overrides. Defaults live in src/lib/permissions.ts;
-- these rows only store what the owner changed.
-- Effective = user override → role override → code default.
-- ---------------------------------------------------------------------
create table if not exists public.role_permissions (
  role        text not null check (role in
                ('owner','manager','accountant','warehouse','cashier','pos','cashier_pos','marketing')),
  permission  text not null check (permission ~ '^[a-z_]+\.[a-z_]+$'),
  allowed     boolean not null,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (role, permission)
);

create table if not exists public.user_permissions (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  permission  text not null check (permission ~ '^[a-z_]+\.[a-z_]+$'),
  allowed     boolean not null,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, permission)
);

-- ---------------------------------------------------------------------
-- Payment methods (editable list)
-- ---------------------------------------------------------------------
create table if not exists public.payment_methods (
  code          text primary key check (code ~ '^[a-z_]{2,30}$'),
  name_ar       text not null,
  name_en       text not null,
  kind          text not null check (kind in ('cash','card','wallet','transfer','on_account')),
  opens_drawer  boolean not null default false,
  sort          integer not null default 100,
  active        boolean not null default true,
  updated_at    timestamptz not null default now()
);

drop trigger if exists payment_methods_touch on public.payment_methods;
create trigger payment_methods_touch before update on public.payment_methods
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Manager PIN: set and verify. Only callable by the server (service role).
-- ---------------------------------------------------------------------
create or replace function public.set_staff_pin(p_user uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_pin !~ '^[0-9]{4,8}$' then
    raise exception 'PIN must be 4–8 digits';
  end if;
  update public.profiles
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10))
   where id = p_user;
end;
$$;

-- Returns the approver's id if username + PIN are valid and the user is active,
-- otherwise null. The permission check (approval.approve) is done in server code.
create or replace function public.verify_staff_pin(p_username text, p_pin text)
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select p.id
    from public.profiles p
   where p.username = lower(p_username)
     and p.active
     and p.pin_hash is not null
     and p.pin_hash = extensions.crypt(p_pin, p.pin_hash);
$$;

revoke all on function public.set_staff_pin(uuid, text) from public, anon, authenticated;
revoke all on function public.verify_staff_pin(text, text) from public, anon, authenticated;
grant execute on function public.set_staff_pin(uuid, text) to service_role;
grant execute on function public.verify_staff_pin(text, text) to service_role;

-- ---------------------------------------------------------------------
-- Security: RLS ON, NO policies. The browser never reads tables;
-- only the server (service role) does, after requireStaff().
-- ---------------------------------------------------------------------
alter table public.settings          enable row level security;
alter table public.company           enable row level security;
alter table public.locations         enable row level security;
alter table public.profiles          enable row level security;
alter table public.role_permissions  enable row level security;
alter table public.user_permissions  enable row level security;
alter table public.payment_methods   enable row level security;

revoke all on public.settings, public.company, public.locations, public.profiles,
              public.role_permissions, public.user_permissions, public.payment_methods
  from anon, authenticated;

-- ---------------------------------------------------------------------
-- Seed data (only inserted if missing; never overwrites your edits)
-- The first owner is created from the /setup page, not here.
-- ---------------------------------------------------------------------
insert into public.settings (key, value) values
  ('vat_rate',        '"15.00"'::jsonb),        -- percent, as text to avoid floats
  ('currency',        '"SAR"'::jsonb),
  ('timezone',        '"Asia/Riyadh"'::jsonb),
  ('weekend_days',    '[5, 6]'::jsonb),          -- 0=Sun … 5=Fri, 6=Sat
  ('show_hijri',      'true'::jsonb),
  ('prices_include_vat', 'true'::jsonb)
on conflict (key) do nothing;

insert into public.company (id, legal_name_ar, legal_name_en)
values (1, '[اسم الشركة]', '[COMPANY NAME]')
on conflict (id) do nothing;

insert into public.locations (code, name_ar, name_en, kind, uses_pos, address_ar, address_en) values
  ('BR01', 'فرع الرياض', 'Riyadh Branch', 'branch',    true,  'الرياض', 'Riyadh'),
  ('BR02', 'فرع جدة',    'Jeddah Branch', 'branch',    true,  'جدة',    'Jeddah'),
  ('WH01', 'المخزن الرئيسي', 'Main Warehouse', 'warehouse', false, 'الرياض', 'Riyadh')
on conflict (code) do nothing;

insert into public.payment_methods (code, name_ar, name_en, kind, opens_drawer, sort) values
  ('cash',          'نقدي',            'Cash',              'cash',       true,  10),
  ('mada',          'مدى',             'mada',              'card',       false, 20),
  ('card',          'فيزا / ماستركارد', 'Visa / Mastercard', 'card',       false, 30),
  ('apple_pay',     'Apple Pay',       'Apple Pay',         'wallet',     false, 40),
  ('stc_pay',       'STC Pay',         'STC Pay',           'wallet',     false, 50),
  ('bank_transfer', 'تحويل بنكي',      'Bank transfer',     'transfer',   false, 60),
  ('on_account',    'آجل',             'On account',        'on_account', false, 70)
on conflict (code) do nothing;
