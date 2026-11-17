---
name: release-check
description: Mandatory checks before saying anything is done, opening/merging a PR, or asking the owner to press a button on the live site. Use for every change to this portal.
---

# Release check (no exceptions)

The owner tests on the live site from a phone. Every mistake they find costs a restart.
Nothing is "done", merged, or handed to the owner until ALL of this passes.

## 1. Run everything
`bash scripts/e2e/check-all.sh` (local Postgres + fake Supabase; dummy env values only).
It runs: lint, typecheck, unit tests, SQL migrations twice, a fresh database, the build,
the flow crawl, both offline tests and the full UI audit (`scripts/e2e/audit.mjs`):
every page (fixed routes + one of each detail page) × desktop/phone × English/Arabic —
links answer, no horizontal scroll, nothing cut off or covered, every in-page button
clicks without errors, every form gives a message that is VISIBLE on screen.
All must report 0 problems. Fix the cause, never loosen a check to get green.

## 2. Test what the owner will actually do
- Before giving the owner a link or a button to press, run that exact flow locally,
  on a phone-size screen, with the same settings as live (e.g. Shopify app "connected").
- Look at the screen after every action: the result must be visible without scrolling.
- External services fail in real life: rate limits ("Throttled"/429), timeouts, missing
  config. Handle them (retry/wait, clear message) and test the failure path.
- Check the live data after the owner acts (Supabase: settings `shopify_push_last_*`,
  `audit_log`, `sync_runs`) instead of assuming it worked.

## 3. Don't break what exists
- Read a file before writing it; never create a file with a name that already exists.
- Migrations: add-only, re-runnable, applied to the live project before merging.
- Every new text in both `src/i18n/en.ts` and `src/i18n/ar.ts`.
- New pages go into one of the 6 sections in `src/components/menu.ts` (as a tab) and into `ROUTES` in `scripts/e2e/audit.mjs` and `crawl.mjs`.
- Never let a row of choices slide sideways on a phone: wrap it (tables may scroll).

## 4. Report honestly
Say what was checked and what was not (e.g. "not tested against the real Shopify").
