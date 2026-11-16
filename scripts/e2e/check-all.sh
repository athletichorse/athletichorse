#!/usr/bin/env bash
# DEV/TEST ONLY — every check that must pass before a change is merged. Local machine only.
# Needs (from the caller's environment, never in the repo): DATABASE_URL (local test Postgres),
# NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
# SETUP_SECRET, CRON_SECRET (dummy local values).
# Usage: bash scripts/e2e/check-all.sh [fresh-db-name]
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=${OUT:-/tmp/e2e-shots}; BASE=${BASE:-http://localhost:3105}; DB=${1:-portal_check}
step() { echo; echo "=== $1"; }

step "lint / typecheck / unit tests"
npm run -s lint && npm run -s typecheck && npm test --silent

step "SQL migrations run twice on an empty database"
su postgres -c "bash scripts/test-sql.sh" | tail -2

step "fresh database with every migration"
export DATABASE_URL=$(echo "$DATABASE_URL" | sed -E "s#/[^/]+\$#/$DB#")
OWNER=$(echo "$DATABASE_URL" | sed -E 's#postgres://([^:]+):.*#\1#')
su postgres -c "dropdb --if-exists $DB; createdb -O $OWNER $DB"
su postgres -c "psql -q -d $DB -c 'create schema if not exists extensions; create extension if not exists pgcrypto schema extensions; create schema if not exists auth; create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, encrypted_password text, created_at timestamptz default now()); grant all on schema auth, extensions to public; grant all on auth.users to public;'"
for f in supabase/migrations/*.sql; do psql -q "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" >/dev/null; done

step "build and start (website app looks connected, so its buttons are tested too)"
pkill -f fake-supabase || true; pkill -f next-server || true; pkill -f "next start" || true
(PORT=54321 nohup node scripts/e2e/fake-supabase.mjs > "$OUT-fake.log" 2>&1 &)
npm run -s build >/dev/null
(SHOPIFY_STORE=audit-test.myshopify.com SHOPIFY_CLIENT_ID=dummy SHOPIFY_CLIENT_SECRET=dummy nohup npx next start -p 3105 > "$OUT-next.log" 2>&1 &)
sleep 6

# browser checks: run them all, then report (one failing does not hide the others)
FAILED=""
run() { local name=$1; shift; step "$name"; if ! "$@" > "$OUT-$name.log" 2>&1; then FAILED="$FAILED|$name"; fi; grep -E "✗|problems|passed" "$OUT-$name.log" | tail -40; }
mkdir -p "$OUT"
run crawl env BASE=$BASE OUT=$OUT node scripts/e2e/crawl.mjs
run offline env BASE=$BASE node scripts/e2e/offline.mjs
run offline2 env BASE=$BASE CUSTOMER="Test Customer" node scripts/e2e/offline2.mjs
run audit env BASE=$BASE OUT=$OUT node scripts/e2e/audit.mjs
echo
if [ -n "$FAILED" ]; then echo "NOT READY — failed: ${FAILED#|}"; exit 1; fi
echo "ALL CHECKS PASSED"
