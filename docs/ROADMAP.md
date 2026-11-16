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
7. ✅ Offline PWA: installable app (manifest + icons, opens on the Cashier), service worker keeps the Cashier page available offline, price list saved on the device, offline sales queued with temporary numbers (`OFF-BR01-XXXX-0001`) and a printed temporary receipt, sent automatically (idempotent by `client_id`) and linked to the real tax invoice, per-device switch for managers, each device chooses its screen (Sell / Quotation desk / Collect), shift close waits for unsent sales
8. 🟡 Layout: menu in the agreed order ✅, print/export menu (80 mm, A4, Excel, PDF) on every page ✅; proper 80 mm/A4 print layouts come with receipts and reports
9. ✅ Seed data: owner (via /setup), two branches, one warehouse, VAT 15%, payment methods

## Owner requests since the brief
- ✅ English as main language
- ✅ Owner "god's eye" overview of all branches and warehouses
- ✅ Website stock source = Jeddah branch (setting, changeable)
- ✅ Daily website sync rule
- ✅ Logo imported from athletic-horse.com (receipts, menu, login, app icon)

## Full settings & features list (second brief) — one PR each
- ✅ A. Settings & permissions: new keys (no-receipt returns, sell without customer, closed shifts, restock requests, all-locations stock, add items, sale prices, labels, website orders, salespeople, payroll), cashier settings (receipt footer, paper/print width, no selling below zero, attendance rules, overtime), manager PIN lock (5 wrong → 15 min), till staff see only Cashier + Stores, customer required unless allowed
- ✅ B. Products: wholesale price, reorder level, sale price for a period (used by the cashier between its dates), names/prices file with old → new preview, barcode labels (Zebra 40×25, Xprinter 38×25, custom; standard/classic look)
- ✅ C. Stock: transfers sent → in transit → received (arrived box per line, shortages/extras kept), write-off reasons, count sheet (every item, sortable), restock requests + quick request page, shortages report (=, ≠, >, ≥, <, ≤ or reorder level), prices and values on every document, all-locations stock view
- ✅ D. Cashier: expenses (types), customer payments, shift report + closed shifts + end of day, several quotations on one receipt, edit/cancel quotations, customer receipt link (no login), credit limit + usual discount + balance + statement, receipt discount, camera scan, quantity focused after picking, customer by mobile/name/number. Later: return slips settled as exchange at Collect
- ✅ E. Reports & dashboard: all reports on one page (by day, branch, payment method, salesperson, customer; best/least sellers; every item; website sales; one item's history), dashboard (today's till sales, invoices today, items below zero, stock per location, latest syncs/uploads)
- ✅ F. Salespeople, attendance, payroll, commission on the 15th: pay settings (salary, hours, commission 6/1000 or %, own or all sales, regularity bonus, food allowance), attendance sheet, advances paid off monthly, bonuses/deductions, payroll month sheet (calculate → approve → pay from drawer or bank, reopen), commission sheet, slips
- ✅ G. Security (الرقابة): working hours per group or person (Riyadh time, overnight windows), device lock with owner approval, activity log; owner never locked out
- ⬜ H. Website two-way: prices, orders → quotations, stock from Jeddah, webhooks
- ⬜ I. Offline everywhere: auto switch, customers/returns/stores/products offline, Windows app, local hub
