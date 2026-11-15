-- =====================================================================
-- 0005_staff_locations.sql — staff can work at several locations, or all.
--  profiles.branch_id     = home location (default on screens)
--  profiles.all_locations = may see / work at every location
--  staff_locations        = the other locations a person may use
-- Safe to run more than once.
-- =====================================================================

alter table public.profiles add column if not exists all_locations boolean not null default false;

create table if not exists public.staff_locations (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  primary key (user_id, location_id)
);
create index if not exists staff_locations_location_idx on public.staff_locations(location_id);

alter table public.staff_locations enable row level security;
revoke all on public.staff_locations from anon, authenticated;

-- The owner sees everything.
update public.profiles set all_locations = true where role = 'owner' and not all_locations;
