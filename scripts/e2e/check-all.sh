#!/usr/bin/env bash
# DEV/TEST ONLY — every check that must pass before a change is merged. Local machine only.
# Needs (from the caller's environment, never in the repo): DATABASE_URL (local test Postgres),
# NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
# SETUP_SECRET, CRON_SECRET (dummy local values).
# Usage: bash scripts/e2e/check-all.sh [fresh-db-name]
set -euo pipefail
export PGOPTIONS="-c client_min_messages=warning"
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
run() { local name=$1; shift; step "$name"; if ! "$@" > "$OUT-$name.log" 2>&1; then FAILED="$FAILED|$name"; fi; grep -E "✗|problems|passed" "$OUT-$name.log" | tail -40 || true; }
mkdir -p "$OUT"
run crawl env BASE=$BASE OUT=$OUT XLSX=${XLSX:-} node scripts/e2e/crawl.mjs
# an item with a barcode and a price (made by the crawl), for the till tests
SKU=$(psql -tA "$DATABASE_URL" -c "select sku from variant_search where sku is not null and price > 0 and active and product_active and not is_service order by sku limit 1")
echo "till tests use item $SKU"
run offline env BASE=$BASE node scripts/e2e/offline.mjs "$SKU"
run offline2 env BASE=$BASE SKU="$SKU" CUSTOMER="Test Customer" node scripts/e2e/offline2.mjs
run offline3 env BASE=$BASE SKU="$SKU" node scripts/e2e/offline3.mjs
# the 4 views side by side (one view alone takes ~25 min)
step "audit (4 views side by side)"
PIDS=""
for v in desktop-en phone-en desktop-ar phone-ar; do
  (env BASE=$BASE OUT=$OUT VIEW=$v node scripts/e2e/audit.mjs > "$OUT-audit-$v.log" 2>&1; echo "exit $?" >> "$OUT-audit-$v.log") &
  PIDS="$PIDS $!"
done
wait $PIDS
for v in desktop-en phone-en desktop-ar phone-ar; do
  echo "-- $v"; grep -E "✗|problems|Error" "$OUT-audit-$v.log" | tail -40 || true
  grep -q "^exit 0$" "$OUT-audit-$v.log" || FAILED="$FAILED|audit-$v"
done
echo
if [ -n "$FAILED" ]; then echo "NOT READY — failed: ${FAILED#|}"; exit 1; fi
echo "ALL CHECKS PASSED"
