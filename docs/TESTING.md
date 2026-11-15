# Testing

| Command | What it checks |
|---|---|
| `npm run lint` · `npm run typecheck` · `npm test` · `npm run build` | code quality, types, unit tests (money/VAT, ZATCA QR, phones, permissions, website sync, Excel import), production build |
| `scripts/test-sql.sh` | every migration runs **twice** on a fresh local Postgres |
| `npm run e2e` | the real app in a browser: first-owner setup, every page and internal link, every working button and form, on desktop and iPhone, in English and Arabic |

## Click-through test (`npm run e2e`)
Runs the real app against a local Postgres that has all migrations applied, through
`scripts/e2e/fake-supabase.mjs`, a small dev-only stand-in for the Supabase REST and Auth
APIs the app uses. Like the real project, it lets only the service-role key read data.

```bash
# 1. fresh database with all migrations (Supabase stubs: roles, auth.users, extensions schema)
createdb portal_e2e && for f in supabase/migrations/*.sql; do psql -d portal_e2e -f "$f"; done
# 2. keys for the stand-in
node scripts/e2e/fake-supabase.mjs --keys      # → {"anon": "...", "service": "..."}
# 3. start the stand-in, then build + start the app with those keys
DATABASE_URL=postgres://… npm run e2e:supabase &
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon> \
SUPABASE_SERVICE_ROLE_KEY=<service> SETUP_SECRET=e2e-setup-secret-123 npm run build && PORT=3105 npm start &
# 4. run it (XLSX optional: also tests the Excel upload)
BASE=http://localhost:3105 OUT=/tmp/shots XLSX=/path/products.xlsx npm run e2e
```
`npm run e2e:offline -- <sku>` (after the crawl, same servers) tests the offline till: turn on offline, cut the internet, reload, scan, pay → temporary number and receipt, shift close blocked, internet back → sent automatically and linked to the real invoice.

It prints ✓/✗ per check, saves a screenshot of every page × device × language in `OUT`,
and exits non-zero on any problem.
