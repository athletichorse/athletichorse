# Athletic Horse (Alhisan Alriyadi / الحصان الرياضي) — handover

Shopify store **athletic-horse.com** (`sfypqe-qu.myshopify.com`): sports equipment, Saudi Arabia, English + Arabic (`ar`), **cash on delivery only**, prices in SAR.
Work branch: `claude/epic-thompson-9cypg1`. Theme source lives in `theme/`.

## Owner rules (always)
- Never show "Made in Egypt" / Egypt as origin anywhere (see `tools/CATALOG_VALIDATION.md` rule 9). Egypt-themed products were deliberately not imported.
- Every customer-facing text needs English **and** Arabic. Brand names stay in Latin script.
- SEO: title `<Short name> | Alhisan Alriyadi` (≤70 chars); description 120–160 chars ending "Cash on delivery across Saudi Arabia."; Arabic meta_title `<الاسم> | الحصان الرياضي`, meta_description ends "الدفع عند الاستلام في جميع أنحاء المملكة."
- Ask before anything that spends money (ads budgets). Never delete products or remove collection memberships without asking.
- Keep the site light: transform/opacity animations only, respect reduced motion.

## Store access
- Shopify MCP connector (`graphql_query` / `graphql_mutation`) works for almost everything, but **refuses `themePublish` and writes to the live (MAIN) theme**.
- Owner's custom app **"Athletic Sask"** (Dev Dashboard app, installed with every scope). Its credentials are environment variables `CLIENT_ID` and `CLIENT_SECRET`. Exchange them for a 24-hour Admin API token — never print the secret or token:
  ```bash
  TOKEN=$(curl -sS -X POST "https://sfypqe-qu.myshopify.com/admin/oauth/access_token" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode grant_type=client_credentials \
    --data-urlencode "client_id=$CLIENT_ID" --data-urlencode "client_secret=$CLIENT_SECRET" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
  curl -sS "https://sfypqe-qu.myshopify.com/admin/api/2026-10/graphql.json" \
    -H "X-Shopify-Access-Token: $TOKEN" -H 'Content-Type: application/json' -d '{"query":"{ shop { name } }"}'
  ```
  Confirm with the owner in the current conversation before publishing a theme or editing the live theme.
- Theme file uploads: `stagedUploadsCreate` → PUT file → `themeFilesUpsert` (unpublished themes via MCP; live theme via the app token).

## Themes
| Theme | ID | State |
|---|---|---|
| Athletic Horse 2026 – Update 7 | 187347828986 | unpublished (was live until 10 Nov 2026) |
| Athletic Horse 2026 – Update 8 | 187384955130 | unpublished; latest non-sale work (menu with About/Contact, motion layer, search fixes) |
| **Athletic Horse – 11.11 Mega Sale** | **188405547258** | **live (MAIN)** since 10 Nov 2026 = Update 8 + sale |

## 11.11 Mega Sale (10–11 Nov 2026, Riyadh time)
- Collection `11-11-mega-sale` (ID 516880924922), manual sort = highest discount first, 55 in-stock discounted products (6–53% off), template suffix `mega-sale`, Arabic title "تخفيضات 11.11 الكبرى".
- Section `theme/sections/mega-sale.liquid` (CSS prefix `ah-1111` — `ah-mega` is taken by the header mega menu): hero + countdown, "Biggest discounts" rail, "Lowest prices" rail (cheapest first). Shown only between Unix 1794258000 and 1794430800 (12 Nov 00:00 Riyadh); JS also hides it when the countdown ends. Red "11.11 Sale" nav link in `header.liquid` uses the same window.
- No prices were changed for the sale.

## Recurring work
- Nightly scheduled check (trigger `trig_01VGXG5GyJzr2BvvoctNSQth`) runs `tools/CATALOG_VALIDATION.md` on ACTIVE products changed in the last 26h + Arabic email templates (`notifications/templates.json`).

## Open items for the owner
- Size labels are mixed after the babasaleh import (~74 products Small/Medium/Large, ~7 S/M/L; owner's descriptions say "S, M, L"). Ask which style before changing.
- Arabic colour names differ: Baby Blue أزرق فاتح vs أزرق سماوي, Fuchsia فوشي vs فوشيا. Ask which to use.
- ~580 imported babasaleh products are still DRAFT (categories, SEO, Arabic done).
- Next project: connect Meta + Google Ads. Recommended connector: "Adspirer Ads & Performance Marketing Agent" (claude.ai → Settings → Connectors); install the Shopify "Facebook & Instagram" channel; "Google & YouTube" channel is already installed.
