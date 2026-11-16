-- =====================================================================
-- 0014_security.sql — الرقابة: working hours and approved devices.
--  * work_hours: per group (role) or per person (person beats group);
--    outside them the person can't log in or use the portal. The owner is
--    never locked out.
--  * devices: with "device lock" on, a person can only use devices the owner
--    approved. A new device asks for approval (it is registered, not approved).
--  * check_access(): the one place these rules are applied.
-- Only adds: safe to run more than once.
-- =====================================================================

create table if not exists public.work_hours (
  id          uuid primary key default gen_random_uuid(),
  role        text,
  profile_id  uuid references public.profiles(id),
  days        smallint[] not null default '{0,1,2,3,4,5,6}',   -- 0 = Sunday … 6 = Saturday (Riyadh)
  start_time  time not null default '08:00',
  end_time    time not null default '23:00',                 -- may be past midnight (end < start)
  active      boolean not null default true,
  updated_at  timestamptz not null default now(),
  check ((role is null) <> (profile_id is null))
);
create unique index if not exists work_hours_role_uq on public.work_hours (role) where role is not null;
create unique index if not exists work_hours_person_uq on public.work_hours (profile_id) where profile_id is not null;

create table if not exists public.devices (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id),
  device_key   text not null check (length(device_key) between 20 and 80),
  label        text not null default '',
  user_agent   text not null default '',
  approved     boolean not null default false,
  approved_by  uuid references public.profiles(id),
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  unique (profile_id, device_key)
);

alter table public.profiles add column if not exists device_lock boolean not null default false;

alter table public.work_hours enable row level security;
alter table public.devices enable row level security;
revoke all on public.work_hours, public.devices from anon, authenticated;

-- 'ok' | 'hours' | 'device'. Registers the device (last seen) when the person has device lock.
create or replace function public.check_access(p_profile uuid, p_device_key text, p_user_agent text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare p record; r record; v_now timestamp := now() at time zone 'Asia/Riyadh'; v_t time; v_dow int; v_ok boolean;
begin
  select id, role, device_lock into p from profiles where id = p_profile;
  if not found then return 'hours'; end if;
  if p.role = 'owner' then return 'ok'; end if;
  -- working hours: the person's rule, else the group's
  select * into r from work_hours where profile_id = p_profile and active;
  if not found then select * into r from work_hours where role = p.role and active; end if;
  if found then
    v_t := v_now::time; v_dow := extract(dow from v_now)::int;
    v_ok := v_dow = any(r.days) and case when r.end_time >= r.start_time then v_t between r.start_time and r.end_time
                                         else v_t >= r.start_time or v_t <= r.end_time end;
    if not v_ok then return 'hours'; end if;
  end if;
  -- approved devices
  if p.device_lock then
    if p_device_key is null or length(p_device_key) < 20 then return 'device'; end if;
    insert into devices (profile_id, device_key, user_agent) values (p_profile, p_device_key, left(coalesce(p_user_agent, ''), 300))
    on conflict (profile_id, device_key) do update set last_seen = now();
    if not exists (select 1 from devices where profile_id = p_profile and device_key = p_device_key and approved) then return 'device'; end if;
  end if;
  return 'ok';
end;
$$;

revoke all on function public.check_access(uuid, text, text) from public, anon, authenticated;
grant execute on function public.check_access(uuid, text, text) to service_role;
