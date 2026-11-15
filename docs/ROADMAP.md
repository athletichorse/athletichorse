# Roadmap: everything from the original brief

✅ done · 🟡 partly done · ⬜ not started. One PR per feature.

## Stack & ground rules
- ✅ Next.js App Router + server actions + TypeScript, on Vercel
- ✅ Supabase with RLS ON and no policies; server uses `db()` only after `requireStaff()` + permission check
- ✅ Tailwind; English default with Arabic switch (`ar.ts` / `en.ts`, same keys; a test enforces this)
- ✅ Vitest; `lint`, `typecheck`, `test`, `build` all pass on every PR
- ✅ Numbered, re-runnable SQL migrations (`scripts/test-sql.sh` runs every migration twice)

## Saudi rules
- ✅ SAR, 2 decimals, `numeric(12,2)`, never floats (test checks migrations)
- ✅ VAT 15% stored as a setting; VAT-inclusive prices; per-line net/VAT/gross with rounding (`src/lib/money.ts`, tested)
- ✅ Asia/Riyadh "today", Friday–Saturday weekend, Gregorian + Hijri (`src/lib/time.ts`, tested)
- ✅ Saudi mobiles +966 5XXXXXXXX, accepts 05… and normalises (tested)
- ✅ Company settings: legal name ar/en, VAT no. (15 digits, 3…3), CR, address, logo; per-branch name/address
- ✅ ZATCA simplified tax invoice + Phase 1 QR on every receipt (built in SQL, matches the official example)
- ✅ Sequential invoice numbers per branch (never reused), credit notes linked to the original, Phase 2-ready: UUID, ICV, previous-invoice hash chain, `einvoice_status`/`einvoice_xml`
- ✅ Payment methods (cash, mada, Visa/MC, Apple Pay, STC Pay, bank transfer, on account), editable list in DB

## Skeleton
1. ✅ Auth: login, first-owner setup, `requireStaff()`, staff profiles
2. ✅ Permissions in one file, role + person overrides, صلاحيات page, manager username+PIN approval keys
3. ✅ Locations: branches, warehouses, sub-stores, kind, uses-POS
4. ✅ Products: SKU (= barcode), extra codes, name ar/en, group + sub-group, unit, cost, VAT-incl price, active, service, variants (colour/size/weight)
   - ✅ **Website (athletic-horse.com, Shopify) import: names, prices, variants, options, images, synced daily at 3:00 Riyadh + "Sync now"**
   - ✅ **Upload file (رفع ملف)**: Excel product import with currency conversion, merges with website items, re-import never duplicates
   - ⬜ Push stock to the website from the Jeddah branch (needs a Shopify Admin API token; comes with step 5)
5. ✅ Stock: `stock_levels` + append-only `stock_movements` + `stock_docs`; changes only in `post_stock_doc()` (one transaction, idempotent by `client_id`); receipts, transfers, write-offs, counts; manager username+PIN approval; Stores + Stock log screens
   - ✅ Customers (serial customer no., Saudi mobile required, unique) · ✅ Audit log (append-only)
6. ✅ POS: shifts with cash count (expected vs counted), cash in/out, desk quotation → cashier, quick sale, customers by mobile, salesperson, split payments + change, discounts/price changes with manager PIN, returns with/without receipt, 80 mm receipt with ZATCA QR + Code 128; all amounts recomputed in SQL
   - ✅ Sales: invoices, returns, today's totals, receipt reprint
   - ✅ Website orders (Shopify) imported nightly + "Sync orders now"; new orders reduce Jeddah stock, cancellations put it back
7. ⬜ Offline PWA: service worker, manifest/icons, queued sales with temporary numbers, auto-send, per-device offline screen
8. 🟡 Layout: menu in the agreed order ✅, print/export menu (80 mm, A4, Excel, PDF) on every page ✅; proper 80 mm/A4 print layouts come with receipts and reports
9. ✅ Seed data: owner (via /setup), two branches, one warehouse, VAT 15%, payment methods

## Owner requests since the brief
- ✅ English as main language
- ✅ Owner "god's eye" overview of all branches and warehouses
- ✅ Website stock source = Jeddah branch (setting, changeable)
- ✅ Daily website sync rule
