# Folder structure / هيكل المجلدات

```
supabase/migrations/        numbered SQL, run by hand in the SQL Editor (re-runnable)
  0001_core.sql             settings, company, locations, profiles, permissions, payment methods, seed
  0002_products.sql         (next PR) products, groups, variants, codes
  0003_stock.sql            (next) stock_levels, stock_movements, stock functions (client_id idempotent)
  0004_pos.sql              (next) shifts, quotations, invoices (UUID, prev-hash, einvoice status), credit notes
src/
  proxy.ts                  refreshes the auth cookie only (Next 16 "proxy" = old middleware)
  app/
    login/  setup/          public pages (setup works once, needs SETUP_SECRET)
    (portal)/               everything behind requireStaff(); top menu in layout.tsx
      page.tsx              الرئيسية
      pos/ stock/ sales/ products/ customers/ staff/ stock-log/ upload/ audit/
      permissions/          صلاحيات (by role / by person)
      locations/ company/   branches & warehouses, company + VAT settings
    actions/                server actions — each starts with assertPermission()
  components/               TopMenu, PrintMenu (80 mm / A4 / Excel / PDF), PageHeader
  i18n/ ar.ts en.ts         same keys (a test enforces it)
  lib/
    permissions.ts          ROLES, PERMISSION_KEYS, defaults, resolution — the ONE file
    auth.ts                 getStaff(), requireStaff(), requirePermission()
    supabase/admin.ts       db() — service role, server only
    supabase/server.ts      auth-only client (session cookie)
    money.ts                halalas (bigint), VAT-inclusive split, line & totals
    zatca.ts                Phase 1 QR TLV/base64
    saudi.ts                +966 mobiles, VAT no., CR no.
    time.ts                 Asia/Riyadh, Fri–Sat weekend, Hijri
tests/                      Vitest
```

## Security model
- RLS is ON for every table with **no policies** → the browser (anon key) can read nothing.
- Server code calls `db()` (service role) only after `requireStaff()` + a permission check.
- Usernames map to internal emails `username@staff.portal.local` for Supabase Auth.
- Manager PINs are bcrypt-hashed in SQL (`set_staff_pin`, `verify_staff_pin`), callable only by the server.

## Money rules
Integer halalas (`bigint`) in TypeScript, `numeric(12,2)` in SQL. Shelf prices include VAT.
Per line: `net = round(gross / 1.15)`, `vat = gross − net`; totals = sum of lines.
