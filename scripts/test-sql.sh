#!/usr/bin/env bash
# Runs every migration TWICE against a throw-away local Postgres database,
# with stand-ins for what Supabase provides. Usage: scripts/test-sql.sh
set -euo pipefail
DB=portal_sql_test
PSQL="psql -q -v ON_ERROR_STOP=1"
dropdb --if-exists "$DB" && createdb "$DB"
$PSQL -d "$DB" <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());
create schema if not exists extensions;
SQL
for pass in 1 2; do
  for f in "$(dirname "$0")"/../supabase/migrations/*.sql; do
    $PSQL -d "$DB" -f "$f" >/dev/null && echo "pass $pass OK  $(basename "$f")"
  done
done
dropdb "$DB"
