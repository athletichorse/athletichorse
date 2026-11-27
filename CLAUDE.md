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
  **Shortcut:** `tools/shopify_admin.sh '<graphql>'` (or `@body.json`) does the exchange, caches the token and refreshes it automatically. Use this — the app credentials are permanent environment variables on the "Athletic Horse" cloud environment, so every session there has access.
- **Standing approval (owner, 10 Nov 2026):** when the owner asks for a store or theme edit — including the live theme or publishing a theme — just do it with the app token; no extra confirmation needed. Still ask first for anything the owner did not ask for, anything that spends money, and deleting products / removing collection memberships.
- Theme file uploads: `stagedUploadsCreate` → PUT file → `themeFilesUpsert` (unpublished themes via MCP; live theme via the app token).

## Themes
| Theme | ID | State |
|---|---|---|
| Athletic Horse 2026 – Update 8 | 187384955130 | unpublished — the only backup (pre-sale design; phone updated 27 Nov) |
| **Athletic Horse – 11.11 Mega Sale** | **188405547258** | **live (MAIN)** since 10 Nov 2026 = Update 8 + sale |

Older themes (Update 5, 6, 7 and "Stock cap + i18n fix") were deleted on 27 Nov 2026 at the owner's request. Store phone / WhatsApp everywhere: +966 56 481 6467 (27 Nov).

## Mega Sale (was "11.11 Mega Sale"; site offer 10 Nov – 30 Nov 2026 Riyadh time, "مددنا العرض"; Meta 11.11 campaign runs to 15 Dec)
- Collection `11-11-mega-sale` (ID 516880924922), sort = lowest price first (PRICE_ASC, owner request 10 Nov), 55 in-stock discounted products (6–53% off), template suffix `mega-sale`, Arabic title "تخفيضات 11.11 الكبرى".
- Section `theme/sections/mega-sale.liquid` (CSS prefix `ah-1111` — `ah-mega` is taken by the header mega menu): hero + countdown, "Biggest discounts" rail (sorted in Liquid by % off, highest first — independent of the collection sort), "Lowest prices" rail (cheapest first). Shown only between Unix 1794258000 and 1796072400 (1 Dec 00:00 Riyadh); JS also hides it when the countdown ends. Red nav link in `header.liquid` uses the same window. **17 Nov (owner): NEVER remove or empty the mega banner.** Banner v2 (17 Nov): lime marquee strip (EN+AR "We've extended the offer! / مددنا العرض!"), red flag ribbon, "Mega Sale" title, "Until end of November" pill, rotating round "up to X%" badge, 4 floating product tiles (in-stock items ≥35% off, owner's product photos), perks chips, background photo (`bg_image`), shapes, countdown to 30 Nov; settings `show_hero`/`bg_image`; animations transform/opacity only, off for reduced motion. Shown on homepage (plus rails) and on the collection page (hero only). On the homepage the banner buttons ("Shop biggest discounts" / "Shop cheapest first") smooth-scroll to the matching rail (`data-ah-jump`, offset by the sticky header) instead of leaving the page (owner request 18 Nov). nav label now "Mega Sale" / "التخفيضات الكبرى", collection renamed "Mega Sale" / "التخفيضات الكبرى" (handle unchanged `11-11-mega-sale`).
- **21 Nov (owner): rebranded to "White Friday" / "الجمعة البيضاء", extended until end of November.** Banner v3 (`.ah-wf` in mega-sale.liquid): white canvas, two crossing animated tape straps (EN+AR), floating icon tiles, sparkles, orbs, outlined "WHITE" + "FRIDAY" title, red flag "We've extended White Friday! / مددنا عروض الجمعة البيضاء!", dark countdown, product tiles with % and price, rotating badge. Announcement bar first message = White Friday message linked to the sale (same window). Product pages: `snippets/wf-deal.liquid` strip under the price for discounted products ("White Friday deal · Ends in Xd Xh Xm"). Nav label + collection title "White Friday" / "الجمعة البيضاء" ("White Friday Sale" / "تخفيضات الجمعة البيضاء"). Everything auto-hides at 1 Dec 00:00 Riyadh.
- **27 Nov (owner): White Friday "today only" on 27 Nov, then "November Sale" / "تخفيضات نوفمبر" from 28 Nov 00:00 Riyadh (Unix 1795813200) to the end of November, then the original site on 1 Dec.** Phase switch is in Liquid (mega-sale.liquid, announcement-bar.liquid, header.liquid nav label, snippets/wf-deal.liquid) using locale keys `sections.mega_sale.wf_*` / `nov_*`; on 27 Nov the countdown runs to midnight and reloads once into the November banner. Collection title renamed to "November Sale" by a scheduled check-in at 28 Nov 00:00 Riyadh (trig_01VJ4RvbpPq73au6Y7VaFRQs).
- No prices were changed for the sale.

## Pages
- **Event Production** `/pages/event-production` (Page 164128555258, created 27 Nov 2026 on owner request) — **the ONLY place on the site with the events / bulk-order WhatsApp +966 50 217 0165** (owner rule). EN body + AR translation generated by `pages/build_event_production_page.py` → `pages/event-production.{en,ar}.html` (edit the builder, rebuild, then pageUpdate body + translationsRegister body_html). 14 customisable items (medals, T-shirts, vests, flags, tents, barrier covers, wristbands, bags, buoys, inflatable gates, shorts, neck straps, printed ID, bib numbers); swipe deck with 3D scale/tilt on mobile + drag on desktop, stacked sticky event cards, scroll-linked steps line, count-up stats, quote builder (items, event type, participants, date, city, name, extras → WhatsApp message), sticky mobile quote bar. CSS prefix `ah-ep`; transform/opacity only, off under reduced motion, content visible without JS. Linked from: main menu (mobile side menu) item "Event Production" / "إنتاج الفعاليات", desktop nav (header.liquid, lime dot, before About us), announcement bar message 3 ("Events, teams & bulk orders – get a quote"), contact page "Events & bulk orders" card. Desktop header was tightened (base.css, end of file) so everything fits 1200–1440px.
- Old **Events & Team Wear** page (163190178042, `pages/build_events_page.py`) was **unpublished 27 Nov** (not deleted) and `/pages/events-team-wear` (+ `/ar/…`) 301-redirect to the Event Production page.

## Order attribution ("Came from")
- `initAttribution()` in `theme/assets/app.js` saves cart attributes (Came from, Landing page, First visit, Last source, Campaign) and re-saves them on every add-to-cart and right before every checkout (`window.ahSaveAttribution`), including the discount-code redirect.
- **17 Nov:** Shopify's "Buy it now" payment button skipped the cart, so those orders had no attributes. It is replaced on product pages by our own `[data-buy-now]` button ("Buy it now" / "اشترِ الآن") that adds to cart → saves attributes → `/checkout`. Don't bring back `{{ form | payment_button }}`.
- Traffic tagged `utm_source=fb|ig, utm_medium=paid, utm_campaign=120253571037620486` (~880 sessions, 0 orders by 22 Nov) is NOT ours and not in any of the owner's ad accounts (checked 22 Nov) — treat as outside traffic. Our Meta ads tag `utm_source=facebook|instagram, utm_medium=paid_social, utm_campaign=<campaign name>`.
- 13 older orders without attributes (#1007–#1033) were back-filled from Shopify's `customerJourneySummary` (extra attribute "Filled in from: Shopify visit data").

## SEO (17 Nov 2026)
- All 56 non-sale collections have hand-written SEO (EN title ≤70 + description 120–160 ending "Cash on delivery across Saudi Arabia.", AR meta_title "… | الحصان الرياضي" + meta_description ending "الدفع عند الاستلام في جميع أنحاء المملكة."). Source text: `tools/collection_seo_copy.py`. New collections need the same.
- Homepage meta description comes from locale `general.meta.home_description` (EN/AR), not `shop.description` (theme.liquid). Avoid "&" in locale meta strings (double-escaped).
- **Blog "Sports Guides" / "أدلة رياضية"** `/blogs/guides` (Blog 111013363962), theme sections `main-blog` / `main-article` (BlogPosting JSON-LD, reading time, CTA). Footer "Sports guides" link. Articles (EN + AR translations, SEO metafields, collection links) — source in `content/guides/*.json`: resistance bands, kids' swimming checklist, football training equipment for academies. Arabic internal links use `/ar/...`.
- Owner to do: verify Google Search Console + Bing Webmaster Tools (Bing also feeds DuckDuckGo and ChatGPT search), submit sitemap.xml; Google Business Profile for the Jeddah store.

## Recurring work
- Nightly scheduled check (trigger `trig_01VGXG5GyJzr2BvvoctNSQth`) runs `tools/CATALOG_VALIDATION.md` on ACTIVE products changed in the last 26h + Arabic email templates (`notifications/templates.json`).

## Open items for the owner
- Size labels are mixed after the babasaleh import (~74 products Small/Medium/Large, ~7 S/M/L; owner's descriptions say "S, M, L"). Ask which style before changing.
- Arabic colour names differ: Baby Blue أزرق فاتح vs أزرق سماوي, Fuchsia فوشي vs فوشيا. Ask which to use.
- ~580 imported babasaleh products are still DRAFT (categories, SEO, Arabic done).
- **Meta Ads (set up 10 Nov 2026, owner chose direct API, not a connector):** Meta app "Alhisan Claude" (Marketing API, unpublished — fine for own assets) in business "BABA SALEH Business Manager" (ID 133031524489610); Employee system user "claude alhisan" (ID 122102649585541449). It reaches ONLY:
  - Ad account **Alhisan Alriyadi `act_2406438510179727`** (SAR, Asia/Riyadh, VISA attached, created 10 Nov 2026).
  - Page **Athletic Horse** `1095169633685157`, Instagram `17841422441194926`.
  - Env network is LIMITED: allowed hosts graph.facebook.com, sfypqe-qu.myshopify.com, athletic-horse.com (+ package managers). fbcdn image hosts are not allowed.
  - Never use Baba Saleh's "Mina Morcos" ad account (EGP/Cairo) or its pixels — separate business, owner wants no overlap.
  - Token: network secret on host `graph.facebook.com` (proxy injects the Bearer header — just `curl https://graph.facebook.com/v23.0/...`); also env var `META_ACCESS_TOKEN`. Never print it.
  - Create campaigns PAUSED; ask owner before any budget/spend.
  - Meta app ID 3595838693925345. **App must be Live** to create new ad creatives (dev-mode error 1885183). Existing-post creatives get no Shop Now link for photo posts, so don't use them for website sales.
  - **Launch (owner approved 10 Nov 2026):** 50 SAR/day until 30 Nov + 200 SAR lifetime for 11.11 (ends 12 Nov 00:00 Riyadh). Saudi Arabia only. **LIVE since 10 Nov 2026 ~16:00 Riyadh** (app published; 36 ads, Shop Now links with UTMs). A/B split test (ad study `1008143255681547`) A vs B until 30 Nov. campaigns `52554357155426` (always-on A/B: ad sets A interests×Engaged shoppers 20/day `52554357159426`, B Advantage+ 20/day `52554357164626`, C warm 10/day `52554357171426`) and `52554357156226` (11.11, ad set `52554357176426`; extended 10 Nov to end 21 Nov 00:00 Riyadh, lifetime budget 335 SAR = 200 + 15/day × 9 days, then raised by owner 10 Nov to 460 SAR ≈ 40 SAR/day until 20 Nov; **17 Nov (owner approved): extended to 16 Dec 00:00 Riyadh, lifetime 2,783 SAR ≈ 86 SAR/day; budget moved from always-on (A 60→20/day, C paused — 0 purchases); 11.11 ad copy now says "limited time only!" / "لفترة محدودة!" (no date), creatives in `ads/ext_creatives_dec_2026-11.json`; **18 Nov (owner): no "11.11" anywhere customer-facing** — ad copy now "🔥 التخفيضات الكبرى – لفترة محدودة!" / "🔥 Mega Sale – limited time only!" (creatives `ads/mega_rename_creatives_2026-11.json`); owner had the 16 Nov bench "11.11" post deleted from IG + FB and the product "Track Multi-Position Adjustable Bench" (9306817757434) taken off the site → set to DRAFT 18 Nov (do not re-activate without asking); campaign renamed "10 Nov–15 Dec". Results to 17 Nov: 11.11 17 purchases / 1,377 SAR on 332 SAR (ROAS 4.1, resistance bands ad 8 purchases); A ROAS 0.9; B paused 13 Nov; C 0 purchases.** ad copy now says "extended until 20 Nov", new creatives in `ads/ext_creatives_2026-11.json`). 10 chosen posts, images (1440px), copy and image hashes in `ads/meta_launch_2026-11.json`. Ad set C targets: FB page engagers 365d `52554356906826`, website visitors 30d `52554360657626`, past purchasers list `52554360661626` (12 hashed Shopify customers, 10 Nov — re-upload as orders grow). Ads use Instagram identity @athletic_horseksa `17841422441194926`. Instagram (547 followers) far outperforms FB (36); Reels are the top organic posts — 8 Reels added as ads 10 Nov (`ads/meta_reels_2026-11.json`, creative via source_instagram_media_id + SHOP_NOW link). 3-day review scheduled 13 Nov (trig_01G5mPckrTRhKcouTvqxwvPW).
  - Pixel/dataset **`1515344367094468`** (created by the Shopify "Facebook & Instagram" channel, CAPI on; named "BABA SALEH Business Manager's pixel" like two Baba Saleh pixels — always use the ID), connected to the ad account.
  - Catalog **`1106955718915628`** "Shopify Product Catalog (sfypqe-qu.myshopify.com)", synced by the channel. Ignore the older "Products from sfypqe-qu.myshopify.com" catalog and all Baba Saleh catalogs.
- Shopify "Facebook & Instagram" channel installed 10 Nov 2026 (publication 232470216954). Google Ads not connected yet (needs developer token approval).
