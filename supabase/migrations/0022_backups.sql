-- =====================================================================
-- 0022_backups.sql — full data backups (nightly copy + monthly download).
-- backup_tables(): every table of the app (public schema).
-- backup_table_rows(name): all rows of one of those tables as JSON (one consistent read).
-- Only the server (service role) may call them. Re-runnable.
-- =====================================================================

create or replace function public.backup_tables()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select table_name::text from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE'
   order by table_name;
$$;

create or replace function public.backup_table_rows(p_table text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  if not exists (select 1 from public.backup_tables() t where t = p_table) then
    raise exception 'unknown table';
  end if;
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from public.%I t', p_table) into v;
  return v;
end;
$$;

revoke all on function public.backup_tables() from public, anon, authenticated;
revoke all on function public.backup_table_rows(text) from public, anon, authenticated;
grant execute on function public.backup_tables() to service_role;
grant execute on function public.backup_table_rows(text) to service_role;
