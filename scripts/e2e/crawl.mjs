#!/usr/bin/env node
/**
 * DEV/TEST ONLY — drives the real app in a browser: every page, every internal link,
 * and every working button/form, on desktop and phone, in English and Arabic.
 * Needs: app running at BASE (against scripts/e2e/fake-supabase.mjs), a fresh database.
 * Usage: BASE=http://localhost:3105 OUT=/tmp/shots XLSX=/path/products.xlsx node scripts/e2e/crawl.mjs
 */
import { createRequire } from "node:module";
// Playwright is pre-installed globally on the test machine (require resolves it; ESM import does not).
const { chromium, devices } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";

const BASE = process.env.BASE || "http://localhost:3105";
const OUT = process.env.OUT || "/tmp/e2e-shots";
const SETUP_SECRET = process.env.SETUP_SECRET || "e2e-setup-secret-123";
fs.mkdirSync(OUT, { recursive: true });

const problems = [];
const passed = [];
const fail = (where, what) => { problems.push(`${where}: ${what}`); console.log(`  ✗ ${where}: ${what}`); };
const ok = (what) => { passed.push(what); console.log(`  ✓ ${what}`); };

function watch(page, label) {
  page.on("pageerror", (e) => fail(label(), `JS error: ${e.message}`));
  page.on("console", (m) => {
    // Product photos come from cdn.shopify.com, which the test machine cannot reach (fine on real devices).
    if (m.type() === "error" && !/favicon|Download the React DevTools|net::ERR_ABORTED|ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED/.test(m.text())) fail(label(), `console: ${m.text().slice(0, 200)}`);
  });
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.origin === BASE && r.status() >= 500) fail(label(), `HTTP ${r.status()} ${u.pathname}`);
  });
}

async function checkPage(page, path, label) {
  const res = await page.goto(BASE + path, { waitUntil: "networkidle" });
  const status = res?.status() ?? 0;
  if (status >= 400) fail(label, `${path} → HTTP ${status}`);
  const text = await page.locator("body").innerText();
  if (/Application error|couldn.t load|Unhandled Runtime Error|Internal Server Error/i.test(text)) fail(label, `${path} shows an error page`);
  const vw = page.viewportSize().width;
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  if (sw > vw + 1) fail(label, `${path} is wider than the screen (${sw}px > ${vw}px)`);
  return { status, text };
}

const browser = await chromium.launch();
const ROUTES = ["/", "/products", "/products/new", "/products/groups", "/products/levels", "/staff", "/locations", "/company", "/permissions", "/upload", "/pos", "/stock", "/stock/new?kind=receipt", "/stock/new?kind=transfer", "/stock/new?kind=count", "/sales", "/sales/reports", "/sales?tab=returns", "/sales?tab=website", "/pos/shifts", "/pos/day", "/pos/expense-types", "/stock/docs", "/stock/count", "/stock/requests", "/stock/requests/quick", "/stock/shortages", "/products/labels", "/staff/employees", "/staff/attendance", "/staff/payroll", "/staff/commission", "/staff/advances", "/audit/hours", "/audit/devices", "/customers", "/stock-log", "/audit"];

// ---------------------------------------------------------------- 1. setup + flows (desktop, English)
console.log("\n== Setup and main flows (desktop, English)");
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
let where = "setup";
watch(page, () => where);

await page.goto(BASE + "/login");
if ((await page.locator("html").getAttribute("lang")) !== "en") fail("login", "default language is not English");
else ok("login page opens in English");

await page.goto(BASE + "/setup");
await page.fill('input[name="secret"]', SETUP_SECRET);
await page.fill('input[name="username"]', "Owner"); // capital on purpose: must be accepted
await page.fill('input[name="full_name"]', "Alhisan Alriyadi");
await page.fill('input[name="password"]', "owner-password-123");
await page.fill('input[name="pin"]', "2580");
await Promise.all([page.waitForURL(BASE + "/", { waitUntil: "commit", timeout: 30000 }), page.click('form:has(input[name="secret"]) button')]);
ok("first owner created via /setup (username with a capital letter)");

where = "home";
const home = await checkPage(page, "/", "home");
for (const s of ["Branches", "Warehouses", "Active staff", "Products", "Missing SKU", "Website stock from", "All locations"]) {
  if (!home.text.includes(s)) fail("home", `missing "${s}"`);
}
ok("owner dashboard shows the overview tiles");

// every internal link on every page answers (no 404/500)
where = "links";
const seen = new Set();
for (const r of ROUTES) {
  await page.goto(BASE + r, { waitUntil: "networkidle" });
  const hrefs = await page.$$eval("a[href^='/']", (as) => as.map((a) => a.getAttribute("href")));
  // /lang links change this browser's language; they are tested separately below.
  for (const h of hrefs) if (!h.startsWith("/lang")) seen.add(h.split("#")[0]);
}
for (const h of seen) {
  const res = await page.request.get(BASE + h, { maxRedirects: 0 });
  if (res.status() >= 400) fail("links", `${h} → HTTP ${res.status()}`);
}
ok(`${seen.size} internal links all answer`);

// home shortcuts go somewhere real (not "Coming soon")
where = "shortcuts";
await page.goto(BASE + "/");
const shortcutHrefs = await page.$$eval("h2 + div a", (as) => as.map((a) => a.getAttribute("href")));
for (const h of shortcutHrefs) {
  await page.goto(BASE + h, { waitUntil: "networkidle" });
  if ((await page.locator("text=Coming soon").count()) > 0) fail("shortcuts", `${h} is a "Coming soon" page`);
}
ok(`${shortcutHrefs.length} home shortcuts open working pages`);

// print / export menu
where = "print menu";
await page.goto(BASE + "/locations");
await page.click("text=Print / Export");
for (const s of ["80 mm receipt", "Print A4", "Excel", "PDF"]) if (!(await page.locator(`text=${s}`).first().isVisible())) fail("print menu", `"${s}" not shown`);
const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }).catch(() => null), page.click("text=Excel")]);
if (!dl) fail("print menu", "Excel export did not download a file");
else ok("print/export menu opens and Excel export downloads");

// company details
where = "company";
await page.goto(BASE + "/company");
await page.fill('input[name="legal_name_en"]', "Alhisan Alriyadi Trading");
await page.fill('input[name="legal_name_ar"]', "شركة الحصان الرياضي للتجارة");
await page.fill('input[name="vat_number"]', "310122393500003");
await page.fill('input[name="cr_number"]', "1010123456");
await Promise.all([page.waitForURL(/ok=1/, { waitUntil: "commit", timeout: 30000 }), page.click('button:text-is("Save")')]);
ok("company details save");
await page.fill('input[name="vat_number"]', "123");
await Promise.all([page.waitForURL(/err=vat/, { waitUntil: "commit", timeout: 30000 }), page.click('button:text-is("Save")')]);
if ((await page.locator(".alert-err").count()) === 0) fail("company", "bad VAT number shows no error");
else ok("bad VAT number is rejected with a message");
await page.fill('input[name="vat_number"]', "310122393500003");
await page.selectOption('select[name="website_stock_location"]', { label: "Jeddah Branch" });
await Promise.all([page.waitForURL(/ok=1/, { waitUntil: "commit", timeout: 30000 }), page.click('button:text-is("Save")')]);
ok("website stock location saved as Jeddah Branch");

// locations: add + edit
where = "locations";
await page.goto(BASE + "/locations");
const addForm = page.locator("form").filter({ has: page.locator('button:text-is("Add")') }).first();
await addForm.locator('input[name="code"]').fill("BR03");
await addForm.locator('select[name="kind"]').selectOption("branch");
await addForm.locator('input[name="name_en"]').fill("Dammam Branch");
await addForm.locator('input[name="name_ar"]').fill("فرع الدمام");
await addForm.locator('input[name="uses_pos"]').check();
await Promise.all([page.waitForURL(/ok=1/, { waitUntil: "commit", timeout: 30000 }), addForm.locator('button:text-is("Add")').click()]);
if (!(await page.locator("text=Dammam Branch").first().isVisible())) fail("locations", "new branch not listed");
else ok("add a branch");
await page.locator("summary", { hasText: "Main Warehouse" }).click();
const editWh = page.locator("details", { has: page.locator("summary", { hasText: "Main Warehouse" }) });
await editWh.locator('input[name="address_en"]').fill("Riyadh, Al Sulay");
await Promise.all([page.waitForURL(/ok=1/, { waitUntil: "commit", timeout: 30000 }), editWh.locator('button:text-is("Save")').click()]);
ok("edit a warehouse");

// staff: add a cashier who works at Riyadh + Main Warehouse
where = "staff";
await page.goto(BASE + "/staff");
const sForm = page.locator("form").filter({ has: page.locator('button:text-is("Add")') }).first();
await sForm.locator('input[name="username"]').fill("Cashier1");
await sForm.locator('input[name="full_name"]').fill("Test Cashier");
await sForm.locator('select[name="role"]').selectOption("cashier");
await sForm.locator('select[name="branch_id"]').selectOption({ label: "Riyadh Branch" });
await sForm.locator('input[name="phone"]').fill("0501234567");
await sForm.locator('input[name="password"]').fill("cashier-pass-1");
await sForm.locator('input[name="pin"]').fill("1234");
await sForm.locator("label", { hasText: "Main Warehouse" }).locator("input").check();
await Promise.all([page.waitForURL(/ok=1|err=/, { waitUntil: "commit", timeout: 30000 }), sForm.locator('button:text-is("Add")').click()]);
if (page.url().includes("err=")) fail("staff", `add staff failed: ${decodeURIComponent(page.url().split("err=")[1])}`);
else {
  const row = await page.locator("tr", { hasText: "Test Cashier" }).innerText();
  if (!/Riyadh Branch/.test(row) || !/Main Warehouse/.test(row) || !/\+966501234567/.test(row)) fail("staff", `row looks wrong: ${row.replace(/\s+/g, " ")}`);
  else ok("add staff with two locations and a normalised mobile number");
}
await page.goto(BASE + "/staff"); // clean URL so we really wait for the next save
await page.locator("summary", { hasText: "Test Cashier" }).click();
const editS = page.locator("details", { has: page.locator("summary", { hasText: "Test Cashier" }) });
await editS.locator('input[name="all_locations"]').check();
await Promise.all([page.waitForURL(/ok=1|err=/, { waitUntil: "commit", timeout: 30000 }), editS.locator('button:text-is("Save")').click()]);
if ((await page.locator("tr", { hasText: "Test Cashier" }).innerText()).includes("All locations")) ok("edit staff → All locations");
else fail("staff", "All locations not saved");

// permissions: role + person
where = "permissions";
await page.goto(BASE + "/permissions?role=cashier");
await page.selectOption('select[name="p:pos.discount"]', "1");
await Promise.all([page.waitForURL(/ok=1/, { waitUntil: "commit", timeout: 30000 }), page.click('button:text-is("Save")')]);
if ((await page.locator('select[name="p:pos.discount"]').inputValue()) !== "1") fail("permissions", "role override not saved");
else ok("role permission override saves");
await page.goto(BASE + "/permissions?tab=user");
await page.locator("a", { hasText: "Test Cashier" }).click();
await page.selectOption('select[name="p:stock.view"]', "1");
await Promise.all([page.waitForURL(/ok=1/, { waitUntil: "commit", timeout: 30000 }), page.click('button:text-is("Save")')]);
ok("person permission override saves");

// products: website sync (real athletic-horse.com)
where = "products sync";
await page.goto(BASE + "/products");
await page.click("text=Sync with website now");
await page.waitForSelector("text=Synced", { timeout: 180000 }).catch(() => fail("products sync", "did not finish within 3 minutes"));
const syncTxt = await page.locator("body").innerText();
if (/Sync failed/.test(syncTxt)) fail("products sync", "sync failed: " + syncTxt.match(/Sync failed[\s\S]{0,200}/)?.[0]);
const count = Number((syncTxt.match(/(\d[\d,]*) products/i)?.[1] || "0").replace(/,/g, ""));
if (count < 300) fail("products sync", `only ${count} products after sync`);
else ok(`website sync imported ${count} products from athletic-horse.com`);
await page.goto(BASE + "/");
await page.waitForFunction(() => document.body.innerText.includes("Synced"), null, { timeout: 15000 }).catch(() => {}); // streamed after the loading screen
if (!(await page.locator("body").innerText()).includes("Synced")) fail("home", "last sync status not shown on home");

// product edit
where = "product edit";
await page.goto(BASE + "/products?f=missing");
await page.locator("tbody a").first().click();
await page.waitForLoadState("networkidle");
await page.fill('input[name="name_ar"]', "منتج تجريبي");
const firstSku = page.locator('input[name^="sku:"]').first();
await firstSku.fill("E2E-SKU-001");
await page.locator('input[name^="cost:"]').first().fill("12.5");
await Promise.all([page.waitForURL(/ok=1|err=/, { waitUntil: "commit", timeout: 30000 }), page.click("text=Save changes")]);
if (page.url().includes("err=")) fail("product edit", decodeURIComponent(page.url().split("err=")[1]));
else if ((await page.locator('input[name^="sku:"]').first().inputValue()) !== "E2E-SKU-001") fail("product edit", "SKU not saved");
else ok("edit a website product: Arabic name, SKU, cost");

// new product + groups
where = "new product";
await page.goto(BASE + "/products/new");
await page.fill('input[name="name_en"]', "Test Jump Rope");
await page.fill('input[name="name_ar"]', "حبل قفز تجريبي");
await page.fill('input[name="sku"]', "E2E-ROPE-1");
await page.fill('input[name="price"]', "35");
await page.fill('input[name="cost"]', "12");
await Promise.all([page.waitForURL(/\/products\/[0-9a-f-]{36}\?ok=1/), page.click('button:text-is("Save item")')]);
ok("create a new product");
const ropeUrl = page.url().split("?")[0];

// price levels: add "VIP", give the rope a VIP price of 30
where = "price levels";
await page.goto(BASE + "/products/levels");
const lvForm = page.locator("form").filter({ has: page.locator('button:text-is("Add")') });
await lvForm.locator('input[name="name_en"]').fill("VIP");
await lvForm.locator('input[name="name_ar"]').fill("كبار العملاء");
await Promise.all([page.waitForURL(/ok=1|err=/, { waitUntil: "commit", timeout: 30000 }), lvForm.locator('button:text-is("Add")').click()]);
if (page.url().includes("err=")) fail("price levels", decodeURIComponent(page.url().split("err=")[1]));
else if (!(await page.locator('input[name="name_en"][value="VIP"]').count())) fail("price levels", "VIP not listed");
else ok("add a price level (VIP); Wholesale is there from the start");
await page.goto(ropeUrl);
const vipBox = page.locator("[data-testid=level-prices] input").first();
await vipBox.fill("32");
await Promise.all([page.waitForURL(/ok=1|err=/, { waitUntil: "commit", timeout: 30000 }), page.click("text=Save changes")]);
if (page.url().includes("err=")) fail("price levels", decodeURIComponent(page.url().split("err=")[1]));
else if ((await page.locator("[data-testid=level-prices] input").first().inputValue()) !== "32.00") fail("price levels", "VIP price not saved");
else ok("item price for the VIP level saved on the product page (32.00 instead of 35.00)");
// prices file with a column for the level: "سعر VIP" 32 → 30
{
  const csv = `${OUT}/prices-levels.csv`;
  fs.writeFileSync(csv, "Barcode,سعر VIP,رصيد Jeddah Branch\nE2E-ROPE-1,30,5\n");
  await page.goto(BASE + "/upload", { waitUntil: "networkidle" });
  if (!/VIP/.test(await page.locator("[data-testid=level-columns]").innerText().catch(() => ""))) fail("price levels", "prices file does not mention the VIP column");
  await page.locator("#prices input[type=file]").setInputFiles(csv);
  await page.locator("#prices table tbody tr").first().waitFor({ timeout: 20000 }).catch(() => {});
  const prev = await page.locator("#prices table").innerText().catch(() => "");
  if (!/VIP/.test(prev) || !/32\.00/.test(prev) || !/30\.00/.test(prev)) fail("price levels", `file preview: ${prev.replace(/\s+/g, " ").slice(0, 200)}`);
  await page.locator("#prices button.btn-primary").click();
  await page.locator("#prices .alert-ok, #prices .alert-err").first().waitFor({ timeout: 20000 }).catch(() => {});
  const res = await page.locator("#prices .alert-ok, #prices .alert-err").first().innerText().catch(() => "");
  await page.goto(ropeUrl);
  if ((await page.locator("[data-testid=level-prices] input").first().inputValue()) !== "30.00") fail("price levels", `prices file did not set the VIP price (${res})`);
  else ok("prices file: a column per level (\"سعر VIP\") — preview 32.00 → 30.00, saved");
  if (!/Counts posted: Jeddah Branch CT-\d{5}/.test(res) || !/Quantity in Jeddah Branch/.test(prev)) fail("prices file", `store column: ${res} | ${prev.replace(/\s+/g, " ").slice(0, 160)}`);
  else ok("prices file: a column per store (\"رصيد Jeddah Branch\" = 5) — previewed, saved as a count");
  // the owner's old-system sheet as it is: adds missing items; an item without a price is not for sale until re-uploaded with one
  const egy = `${OUT}/egypt-sheet.csv`;
  const upload = async (rowsCsv) => {
    fs.writeFileSync(egy, "كود الصنف,الباركود / الرقم البديل,الصنف,وحدة اساسية,المجموعة,سعر الشراء,اخر س شراء,سعر البيع,الرصيد,حالة الضريبه\n" + rowsCsv);
    await page.goto(BASE + "/upload", { waitUntil: "networkidle" });
    await page.locator("#prices input[type=file]").setInputFiles(egy);
    await page.locator("#prices [data-testid=qty-store] select, #prices table").first().waitFor({ timeout: 20000 }).catch(() => {});
  };
  await upload("9001,E2E-NEW-1,صنف تجريبي بدون سعر,قطعة,أدوات,10,0,,0,غير خاضع للضريبه\n9002,E2E-NEW-2,صنف تجريبي بسعر,قطعة,أدوات,15,0,25,4,غير خاضع للضريبه\n");
  if (!(await page.locator("#prices [data-testid=add-missing] input").isChecked().catch(() => false))) fail("prices file", "add missing items option not shown");
  await page.locator("#prices [data-testid=qty-store] select").selectOption({ label: "Jeddah Branch" });
  await page.waitForTimeout(800);
  await page.locator("#prices button.btn-primary").click();
  await page.locator("#prices .alert-ok, #prices .alert-err").first().waitFor({ timeout: 30000 }).catch(() => {});
  const r1 = await page.locator("#prices .alert-ok, #prices .alert-err").first().innerText().catch(() => "");
  if (!/Items added: 2/.test(r1) || !/Jeddah Branch CT-\d{5}/.test(r1)) fail("prices file", `old-system sheet, first upload: ${r1}`);
  else ok("old-system sheet as it is: 2 missing items added (barcode column used), quantity column put in the chosen store");
  await upload("9001,E2E-NEW-1,صنف تجريبي بدون سعر,قطعة,أدوات,10,0,12,0,غير خاضع للضريبه\n");
  await page.locator("#prices button.btn-primary").click();
  await page.locator("#prices .alert-ok, #prices .alert-err").first().waitFor({ timeout: 30000 }).catch(() => {});
  const r2 = await page.locator("#prices .alert-ok, #prices .alert-err").first().innerText().catch(() => "");
  if (!/Put on sale \(got a price\): 1/.test(r2)) fail("prices file", `re-upload with a price: ${r2}`);
  else ok("same sheet re-uploaded with a price: the item is put on sale");
}
where = "groups";
await page.goto(BASE + "/products/groups");
const gForm = page.locator("form").filter({ has: page.locator('button:text-is("Add")') });
await gForm.locator('input[name="name_en"]').fill("Jump Ropes");
await gForm.locator('input[name="name_ar"]').fill("حبال القفز");
await Promise.all([page.waitForURL(/ok=1|err=/, { waitUntil: "commit", timeout: 30000 }), gForm.locator('button:text-is("Add")').click()]);
if (page.url().includes("err=")) fail("groups", decodeURIComponent(page.url().split("err=")[1]));
else ok("add a product group");
// new item with colours × sizes, a new type typed by hand, wholesale + offer price
where = "new item with colours and sizes";
await page.goto(BASE + "/products/new");
const np = page.locator("[data-testid=new-product]");
await np.locator("#np-sku").fill("E2E-SHIRT");
await np.locator("#np-group").selectOption({ label: "Jump Ropes" });
await np.locator("#np-type").fill("Speed ropes");
await np.locator("#np-ar").fill("حبل سرعة تجريبي");
await np.locator("#np-en").fill("Test Speed Rope");
await np.locator("#np-price").fill("50");
await np.locator("#np-wh").fill("40");
await np.locator("#np-reorder").fill("2");
await np.locator("#np-offer").fill("45");
await np.locator("#np-from").fill("2026-01-01");
await np.locator("#np-to").fill("2099-12-31");
await np.locator("#np-colours").fill("Red، Blue");
await np.locator("#np-sizes").fill("S, M");
await Promise.all([page.waitForURL(/\/products\/[0-9a-f-]{36}\?ok=1|err=/), page.click('button:text-is("Save item")')]);
if (page.url().includes("err=")) fail("new item", decodeURIComponent(page.url().split("err=")[1]));
else {
  const skus = await page.locator('input[name^="sku:"]').evaluateAll((els) => els.map((e) => e.value));
  if (skus.join(",") !== "E2E-SHIRT-01,E2E-SHIRT-02,E2E-SHIRT-03,E2E-SHIRT-04") fail("new item", `colours × sizes: ${skus.join(",")}`);
  else ok("new item: 2 colours × 2 sizes → 4 items with barcodes -01 … -04");
  const wh = await page.locator('input[name^="wholesale:"]').first().inputValue();
  const offer = await page.locator('input[name^="sale:"]').first().inputValue();
  if (Number(wh) !== 40 || Number(offer) !== 45) fail("new item", `wholesale ${wh}, offer ${offer}`); else ok("new item: wholesale price and offer price saved");
  await page.goto(BASE + "/products/groups");
  if (!(await page.locator('input[name="name_en"][value="Speed ropes"]').count())) fail("new item", "the new type was not added to the list"); else ok("a type typed by hand is added to the groups list");
}

// upload file
where = "upload";
if (process.env.XLSX) {
  await page.goto(BASE + "/upload");
  await page.setInputFiles('input[type="file"]', process.env.XLSX);
  await page.waitForSelector("text=File summary", { timeout: 60000 });
  await page.click('button:text-is("Import products")');
  await page.waitForSelector("text=Import finished", { timeout: 300000 }).catch(() => fail("upload", "import did not finish"));
  const t = await page.locator("body").innerText();
  if (/Import stopped/.test(t)) fail("upload", t.match(/Import stopped[^\n]*/)?.[0]);
  else if (/Import finished/.test(t)) ok("Excel upload: " + (t.match(/New products\s*\n?\s*(\d+)/)?.[0] || "").replace(/\s+/g, " "));
}


// ---------------------------------------------------------------- stock
async function stockDoc(pg, kind, sku, qty, { to, mgr, reason } = {}) {
  await pg.goto(BASE + `/stock/new?kind=${kind}`, { waitUntil: "networkidle" });
  if (to) await pg.locator("select").nth(1).selectOption({ label: to });
  if (kind === "write_off") await pg.locator("select").nth(1).selectOption(reason ?? "damaged");
  const box = pg.locator('input[placeholder*="SKU"]').first();
  await box.fill(sku);
  await box.press("Enter");
  await pg.waitForSelector("table tbody tr", { timeout: 15000 });
  await pg.locator("table tbody tr input").first().fill(String(qty));
  if (mgr) {
    await pg.locator('input[autocapitalize="none"]').last().fill(mgr.u);
    await pg.locator('input[type="password"]').last().fill(mgr.p);
  }
  await pg.click(kind === "transfer" ? 'button:text-is("Send transfer")' : 'button:text-is("Post")');
  await pg.waitForSelector(".alert-ok, .alert-err", { timeout: 20000 });
  return (await pg.locator(".alert-ok, .alert-err").first().innerText()).trim();
}
where = "stock";
const m1 = await stockDoc(page, "receipt", "E2E-ROPE-1", 10);
if (!/Posted/.test(m1)) fail("stock", `receipt: ${m1}`); else ok("stock receipt (scan by SKU) posts");
const m2 = await stockDoc(page, "transfer", "E2E-ROPE-1", 4, { to: "Jeddah Branch" });
if (!/Posted/.test(m2)) fail("stock", `transfer: ${m2}`); else ok("stock transfer to Jeddah sent (in transit)");
// Jeddah receives it: all 4 arrived
const trNo = (m2.match(/TR-\d{5}/) ?? [])[0];
if (!trNo) fail("stock", `transfer number should look like TR-00012: ${m2}`);
// stock movements page: new-document buttons, filters, the transfer with its prefix and "on the way"
await page.goto(BASE + "/stock/docs", { waitUntil: "networkidle" });
const mvBtns = await page.locator("[data-testid=moves-actions]").innerText();
for (const w of ["New transfer", "New transfer request", "New goods received", "New issue", "Count"]) if (!mvBtns.includes(w)) fail("stock", `stock movements: button "${w}" missing`);
await page.click('[data-testid=moves-filters] a:text-is("Incoming to me")');
await page.waitForURL(/incoming=1/);
const inc = await page.locator("main table").innerText();
if (!inc.includes(trNo) || !/On the way: waiting to be received/.test(inc)) fail("stock", `incoming to me: ${inc.slice(0, 200)}`);
else ok(`stock movements: buttons, filters; incoming transfer ${trNo} shows "on the way"`);
await page.locator(`a:has-text("${trNo}")`).first().click();
await page.waitForSelector("[data-testid=receive]", { timeout: 15000 });
await page.click('button:text-is("Receive transfer")');
await page.waitForFunction(() => document.body.innerText.includes("Received"), null, { timeout: 20000 });
ok("transfer received at Jeddah");
// search by columns on the Stores lists: stock movements, number starts with "TR-"
await page.goto(BASE + "/stock/docs", { waitUntil: "networkidle" });
await page.click("[data-testid=column-filter-open]");
const cf = page.locator("[data-testid=column-filter]");
await cf.locator('select[aria-label="No. · Match"]').selectOption("starts");
await cf.locator('input[aria-label="No."]').fill("TR-");
await page.waitForSelector("[data-testid=column-filter-count]", { timeout: 10000 }).catch(() => {});
const visibleNos = await page.locator("main table tbody tr:visible td:first-child").evaluateAll((tds) => tds.map((td) => td.innerText.trim().slice(0, 8)));
if (!visibleNos.length || visibleNos.some((x) => !x.startsWith("TR-"))) fail("stock", `column filter on movements: ${visibleNos.join(" | ")}`);
else ok(`search by columns on stock movements: only TR- rows (${visibleNos.length})`);
// stock by store: the item finder in look-up mode (no "Add")
await page.goto(BASE + "/stock", { waitUntil: "networkidle" });
await page.click("[data-testid=column-search-open]");
const sf = page.locator("[data-testid=column-search]");
await sf.locator('input[aria-label="Code"]').fill("E2E-ROPE");
await page.waitForFunction(() => /E2E-ROPE-1/.test(document.querySelector("[data-testid=column-search] tbody")?.textContent ?? ""), null, { timeout: 15000 }).catch(() => {});
if (!/E2E-ROPE-1/.test(await sf.innerText()) || (await sf.locator('button:text-is("Add")').count())) fail("stock", "stock by store: item finder (look-up) did not work");
else ok("stock by store: search by columns finds the item with its stock here (look-up only)");
const m3 = await stockDoc(page, "write_off", "E2E-ROPE-1", 1);
if (!/Posted/.test(m3)) fail("stock", `write-off: ${m3}`); else ok("write-off posts");
const m4 = await stockDoc(page, "count", "E2E-ROPE-1", 7);
if (!/Posted/.test(m4)) fail("stock", `count: ${m4}`); else ok("stock count posts");
await page.goto(BASE + "/stock?q=e2e-rope", { waitUntil: "networkidle" });
const stockTxt = await page.locator("table").first().innerText();
if (!/Riyadh Branch[\s\S]*7|7[\s\S]*Riyadh/.test(stockTxt) || !/Jeddah Branch/.test(stockTxt)) fail("stock", `levels look wrong: ${stockTxt.replace(/\s+/g, " ").slice(0, 200)}`);
else ok("stock levels: Riyadh 7 after count, Jeddah holds the transfer");
await page.goto(BASE + "/stock-log", { waitUntil: "networkidle" });
const logTxt = await page.locator("table").first().innerText();
for (const k of ["Receipt", "Transfer out", "Transfer in", "Write-off", "Count"]) if (!logTxt.includes(k)) fail("stock log", `missing ${k}`);
ok("stock log lists every movement");

// warehouse user needs a manager's PIN for receipts
where = "approval";
await page.goto(BASE + "/staff");
const wForm = page.locator("form").filter({ has: page.locator('button:text-is("Add")') }).first();
await wForm.locator('input[name="username"]').fill("store1");
await wForm.locator('input[name="full_name"]').fill("Store Keeper");
await wForm.locator('select[name="role"]').selectOption("warehouse");
await wForm.locator('select[name="branch_id"]').selectOption({ label: "Main Warehouse" });
await wForm.locator('input[name="password"]').fill("store-pass-1");
await Promise.all([page.waitForURL(/ok=1|err=/, { waitUntil: "commit" }), wForm.locator('button:text-is("Add")').click()]);
const wctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const wp = await wctx.newPage();
watch(wp, () => where);
await wp.goto(BASE + "/login");
await wp.fill('input[name="username"]', "store1");
await wp.fill('input[name="password"]', "store-pass-1");
await Promise.all([wp.waitForURL(BASE + "/", { waitUntil: "commit" }), wp.click('form:has(input[name="password"]) button')]);
const a1 = await stockDoc(wp, "receipt", "E2E-ROPE-1", 2);
if (!/manager/i.test(a1)) fail("approval", `receipt without PIN was not stopped: ${a1}`); else ok("warehouse receipt without manager PIN is refused");
const a2 = await stockDoc(wp, "receipt", "E2E-ROPE-1", 2, { mgr: { u: "owner", p: "0000" } });
if (!/wrong/i.test(a2)) fail("approval", `wrong PIN accepted: ${a2}`); else ok("wrong manager PIN is refused");
const a3 = await stockDoc(wp, "receipt", "E2E-ROPE-1", 2, { mgr: { u: "owner", p: "2580" } });
if (!/Posted/.test(a3)) fail("approval", `right PIN refused: ${a3}`); else ok("receipt with the manager's username + PIN posts");
await wctx.close();

// customers
where = "customers";
await page.goto(BASE + "/customers");
const cForm = page.locator("form").filter({ has: page.locator('button:text-is("Add")') }).first();
await cForm.locator('input[name="phone"]').fill("0551234567");
await cForm.locator('input[name="name"]').fill("Test Customer");
await Promise.all([page.waitForURL(/ok=1|err=/, { waitUntil: "commit" }), cForm.locator('button:text-is("Add")').click()]);
if (!(await page.locator("table").first().innerText()).includes("+966551234567")) fail("customers", "new customer not listed");
else ok("add a customer (mobile normalised, customer # given)");
await page.goto(BASE + "/customers");
const cForm2 = page.locator("form").filter({ has: page.locator('button:text-is("Add")') }).first();
await cForm2.locator('input[name="phone"]').fill("+966 55 123 4567");
await Promise.all([page.waitForURL(/err=/, { waitUntil: "commit" }), cForm2.locator('button:text-is("Add")').click()]);
if (!/already exists/.test(await page.locator(".alert-err").innerText())) fail("customers", "duplicate mobile not refused");
else ok("duplicate customer mobile is refused");
// a customer on the VIP price level
await page.goto(BASE + "/customers");
const vForm = page.locator("form").filter({ has: page.locator('button:text-is("Add")') }).first();
await vForm.locator('input[name="phone"]').fill("0559876543");
await vForm.locator('input[name="name"]').fill("VIP Customer");
await vForm.locator('select[name="price_level_id"]').selectOption({ label: "VIP" });
await Promise.all([page.waitForURL(/ok=1|err=/, { waitUntil: "commit" }), vForm.locator('button:text-is("Add")').click()]);
if (page.url().includes("err=")) fail("customers", "VIP customer: " + decodeURIComponent(page.url().split("err=")[1]));
else ok("add a customer on the VIP price level");
// edit from the customer's own page ("Edit customers" permission)
await page.goto(BASE + "/customers?q=Test");
await page.locator('a:text-is("Edit")').first().click();
await page.waitForSelector("#edit", { timeout: 15000 });
const customerUrl = page.url().split("#")[0];
const eForm = page.locator("form#edit");
await eForm.locator('input[name="discount_pct"]').fill("5");
await eForm.locator('input[name="notes"]').fill("e2e edit");
// business details: VAT no., CR no., national address
await eForm.locator('input[name="vat_number"]').fill("300000000000003");
await eForm.locator('input[name="cr_number"]').fill("1010123456");
await eForm.locator('input[name="addr_building"]').fill("1234");
await eForm.locator('input[name="addr_street"]').fill("King Fahd Road");
await eForm.locator('input[name="addr_district"]').fill("Al Olaya");
await eForm.locator('input[name="addr_city"]').fill("Riyadh");
await eForm.locator('input[name="addr_country"]').fill("Saudi Arabia");
await eForm.locator('input[name="addr_postal"]').fill("12345");
await eForm.locator('input[name="addr_additional"]').fill("6789");
await Promise.all([page.waitForURL(/ok=1|err=/, { waitUntil: "commit" }), eForm.locator('button:text-is("Save")').click()]);
const cAfter = await page.locator("main").innerText();
if (!/Saved/.test(cAfter) || !/5%/.test(cAfter)) fail("customers", `edit customer: ${cAfter.slice(0, 200)}`);
else ok("edit a customer from their page (usual discount 5%)");
const biz = await page.locator("[data-testid=customer-business]").innerText().catch(() => "");
for (const w of ["300000000000003", "1010123456", "1234", "King Fahd Road", "Al Olaya", "Riyadh", "12345", "6789", "Saudi Arabia"]) if (!biz.includes(w)) fail("customers", `business details missing "${w}"`);
ok("customer VAT no., CR no. and national address saved and shown");
// a wrong postal code is refused with a clear message
await page.locator("form#edit").locator('input[name="addr_postal"]').fill("12");
await Promise.all([page.waitForURL(/err=/, { waitUntil: "commit" }), page.locator("form#edit").locator('button:text-is("Save")').click()]);
if (!/Postal code: 5 digits/.test(await page.locator(".alert-err").innerText().catch(() => ""))) fail("customers", "bad postal code not explained");
else ok("wrong postal code refused with a clear message");
await eForm.locator('input[name="discount_pct"]').fill("0");
await page.locator("form#edit").locator('input[name="addr_postal"]').fill("12345");
await page.locator("form#edit").locator('button:text-is("Save")').click(); // back to no discount (the till tests use this customer)
await page.waitForFunction(() => /\b0%/.test(document.querySelector("main")?.innerText ?? ""), null, { timeout: 15000 }).catch(() => fail("customers", "discount not set back to 0"));

// audit
where = "audit";
await page.goto(BASE + "/audit", { waitUntil: "networkidle" });
const auditTxt = await page.locator("table").first().innerText();
for (const a of ["stock.receipt", "customer.create", "staff.create", "company.update"]) if (!auditTxt.includes(a)) fail("audit", `missing ${a}`);
ok("audit log records stock, customers, staff and company changes");


// ---------------------------------------------------------------- cashier
where = "pos";
await page.goto(BASE + "/pos", { waitUntil: "networkidle" });
await page.locator("select").first().selectOption({ label: "Riyadh Branch" });
await page.locator('input[inputmode="decimal"]').first().fill("100");
await page.click('button:text-is("Open shift")');
await page.waitForSelector("text=Shift open since", { timeout: 20000 });
ok("open a shift with 100 SAR in the drawer");
// start screen: big tiles, each named in both languages; Point of sale opens the till
await page.waitForSelector("[data-testid=pos-tiles]", { timeout: 15000 }).catch(() => {});
const tileTxt = await page.locator("[data-testid=pos-tiles]").innerText().catch(() => "");
for (const w of ["Point of sale", "نقاط بيع", "Collect payment", "تحصيل", "Return", "مرتجع", "Close shift", "إغلاق الوردية"]) if (!tileTxt.includes(w)) fail("pos", `start tile missing "${w}"`);
ok("cashier start screen: big tiles in English + Arabic");
await page.click("[data-tile=sell]");

async function scan(code) {
  const box = page.locator('input[placeholder*="Scan barcode"]');
  await box.fill(code);
  await box.press("Enter");
  await page.waitForSelector(`td:has-text("${code}")`, { timeout: 15000 }).catch(() => {});
}
await scan("E2E-ROPE-1");
await scan("E2E-ROPE-1"); // second scan → qty 2
await page.waitForFunction(() => document.querySelector("main table tbody tr input")?.value === "2", null, { timeout: 10000 }).catch(() => {});
const qtyVal = await page.locator("main table tbody tr input").first().inputValue();
if (qtyVal !== "2") fail("pos", `scanning twice should give qty 2, got ${qtyVal}`); else ok("scan adds items; scanning again increases the quantity");
const totalTxt = await page.locator("main aside").innerText();
if (!/70\.00/.test(totalTxt)) fail("pos", `total should be 70.00 (2 × 35): ${totalTxt.replace(/\s+/g, " ").slice(0, 160)}`); else ok("cart total 70.00 incl. VAT (net 60.87 + VAT 9.13)");
await page.locator('input[placeholder="Mobile, name or customer no."]').first().fill("0551234567");
await page.click('button:text-is("Find")');
await page.waitForSelector("text=+966551234567", { timeout: 10000 }).catch(() => fail("pos", "customer not found by mobile"));
await page.locator('label:has-text("Cash given") + input').fill("100");
await page.click('button:has-text("Pay SAR")');
await page.waitForSelector(".alert-ok, .alert-err", { timeout: 20000 });
const saleMsg = await page.locator(".alert-ok, .alert-err").first().innerText();
if (!/Sale complete — invoice BR01-\d{6}/.test(saleMsg) || !/Change: 30\.00/.test(saleMsg)) fail("pos", `sale: ${saleMsg}`);
else ok(`sale posted (${saleMsg.match(/BR01-\d{6}/)[0]}), change 30.00 from 100`);
const invoiceNo = saleMsg.match(/BR01-\d{6}/)?.[0];
const receiptHref = await page.locator('a:has-text("Print receipt")').getAttribute("href");
const rp = await ctx.newPage();
watch(rp, () => "receipt");
await rp.goto(BASE + receiptHref.replace("?print=1", ""), { waitUntil: "networkidle" });
const rTxt = await rp.locator("article").innerText();
// 310122393500003 = the VAT no. set in the company step above
for (const s of ["فاتورة ضريبية مبسطة", "Simplified Tax Invoice", "310122393500003", invoiceNo, "70.00", "9.13"]) if (!rTxt.includes(s)) fail("receipt", `missing "${s}"`);
if ((await rp.locator("article svg").count()) < 2) fail("receipt", "QR code or barcode missing");
else ok("80 mm receipt: bilingual title, VAT no., totals, ZATCA QR and Code 128 barcode");
await rp.close();

// item finder (search by columns): each column has its own match type
await page.click("[data-testid=column-search-open]");
const cs = page.locator("[data-testid=column-search]");
await cs.locator("[data-testid=finder-count]").waitFor({ timeout: 15000 }).catch(() => {});
if (!/First \d+ of \d+ items/.test(await cs.locator("[data-testid=finder-count]").innerText().catch(() => ""))) fail("pos", "item finder: count of items not shown");
await cs.locator('input[aria-label="Item name"]').fill("jump rope");                          // contains (default)
await cs.locator('select[aria-label="Code · Match"]').selectOption("ends");
await cs.locator('input[aria-label="Code"]').fill("rope-1");                                  // ends with
await page.waitForFunction(() => /E2E-ROPE-1/.test(document.querySelector("[data-testid=column-search] tbody")?.textContent ?? ""), null, { timeout: 15000 }).catch(() => {});
const csRow = await cs.locator("tbody tr").first().innerText().catch(() => "");
if (!/E2E-ROPE-1/.test(csRow) || !/35\.00/.test(csRow)) fail("pos", `item finder: ${csRow}`);
else ok("item finder: name contains + code ends with → the item, its price and stock here");
await cs.locator('select[aria-label="Code · Match"]').selectOption("starts");
await page.waitForFunction(() => /No items match/.test(document.querySelector("[data-testid=column-search]")?.textContent ?? ""), null, { timeout: 15000 })
  .then(() => ok("item finder: code starts with (no match for the end of a code)")).catch(() => fail("pos", "item finder: starts with should not match the end of a code"));
await cs.locator('select[aria-label="Code · Match"]').selectOption("contains");
await cs.locator('select[aria-label="Sale price · Match"]').selectOption("gt");
await cs.locator('input[aria-label="Sale price"]').fill("100");
await page.waitForFunction(() => /No items match/.test(document.querySelector("[data-testid=column-search]")?.textContent ?? ""), null, { timeout: 15000 })
  .then(() => ok("item finder: price greater than 100 → none")).catch(() => fail("pos", "item finder: price filter"));
await cs.locator('select[aria-label="Sale price · Match"]').selectOption("lte");
await cs.locator('input[aria-label="Sale price"]').fill("35");
await cs.locator("tbody tr").first().waitFor({ timeout: 15000 }).catch(() => {});
// ask the quantity: pick the item → quantity box → 3 in the cart
await cs.locator('label:has-text("Ask the quantity") input').check();
await cs.locator("tbody tr").first().click();
await cs.locator("[data-testid=finder-qty] input").fill("3");
await cs.locator('[data-testid=finder-qty] button:text-is("Add")').click();
await page.waitForFunction(() => [...document.querySelectorAll("main table tbody tr input")].some((x) => x.value === "3"), null, { timeout: 10000 })
  .then(() => ok("item finder: ask the quantity → 3 added to the cart")).catch(() => fail("pos", "item finder: quantity not added"));
await cs.locator('button:text-is("Close the finder")').click();
// the VIP customer: the rope's price changes to the VIP price, the server accepts it
await page.locator('input[placeholder="Mobile, name or customer no."]').first().fill("0559876543");
await page.click('button:text-is("Find")');
await page.waitForSelector("[data-testid=customer-level]", { timeout: 10000 }).catch(() => fail("pos", "customer's price level not shown"));
await page.waitForFunction(() => /90\.00/.test(document.querySelector("main aside")?.textContent ?? ""), null, { timeout: 10000 })
  .then(() => ok("customer on VIP level: 3 × 30.00 = 90.00 at the till")).catch(async () => fail("pos", `VIP total: ${(await page.locator("main aside").innerText()).replace(/\s+/g, " ").slice(0, 160)}`));
await page.locator('label:has-text("Cash given") + input').fill("90");
await page.click('button:has-text("Pay SAR")');
await page.waitForSelector(".alert-ok, .alert-err", { timeout: 20000 });
const vipMsg = await page.locator(".alert-ok, .alert-err").first().innerText();
if (!/Sale complete/.test(vipMsg)) fail("pos", `VIP sale: ${vipMsg}`); else ok("VIP sale accepted by the server at the level price");

// quotation at the desk → collect at the cashier
await page.click('button:text-is("Quotation")');
await scan("E2E-ROPE-1");
await page.click('button:text-is("Save quotation")');
await page.waitForSelector(".alert-ok, .alert-err", { timeout: 20000 });
const qMsg = await page.locator(".alert-ok, .alert-err").first().innerText();
const qNo = qMsg.match(/number (\d+)/)?.[1];
if (!qNo) fail("pos", `quotation: ${qMsg}`); else ok(`desk quotation saved (#${qNo})`);
await page.click('button:text-is("Collect")');
await page.locator('input[placeholder="Quotation #"]').fill(qNo ?? "0");
await page.click('button:text-is("Load")');
await page.waitForSelector("table tbody tr", { timeout: 15000 });
await page.click('button:has-text("Pay SAR")');
await page.waitForSelector(".alert-ok, .alert-err", { timeout: 20000 });
const cMsg = await page.locator(".alert-ok, .alert-err").first().innerText();
if (!/Sale complete/.test(cMsg)) fail("pos", `collect: ${cMsg}`); else ok("quotation collected at the cashier → invoice");

// return with receipt
await page.click('button:text-is("Return")');
await page.locator('input[placeholder*="Invoice number"]').fill(invoiceNo ?? "");
await page.click('button:text-is("Find")');
await page.waitForSelector("table tbody tr", { timeout: 15000 });
await page.locator("table tbody tr input").first().fill("1");
await page.click('button:text-is("Refund")');
await page.waitForSelector(".alert-ok, .alert-err", { timeout: 20000 });
const rMsg = await page.locator(".alert-ok, .alert-err").first().innerText();
if (!/credit note BR01-CN-\d{6}/.test(rMsg) || !/35\.00/.test(rMsg)) fail("pos", `return: ${rMsg}`); else ok("return with receipt → credit note, refund 35.00");

// expenses screen: record one, see it in this shift's list
await page.click('button:text-is("Expenses")');
const exv = page.locator("[data-testid=expenses]");
await exv.locator("select").first().selectOption({ label: "Transport" });
await exv.locator("input[inputmode=decimal]").fill("5");
await exv.locator("input:not([inputmode])").first().fill("taxi e2e");
await exv.locator('button:text-is("Save expense")').click();
await page.waitForFunction(() => /taxi e2e/.test(document.querySelector("[data-testid=expenses]")?.textContent ?? ""), null, { timeout: 15000 }).catch(() => {});
const exTxt = await exv.innerText();
if (!/taxi e2e/.test(exTxt) || !/Total:\s*5\.00/.test(exTxt)) fail("pos", `expenses: ${exTxt.replace(/\s+/g, " ").slice(0, 200)}`);
else ok("expense recorded from the Expenses screen; listed with this shift's total 5.00");

// cash out, close shift
await page.click('button:text-is("Drawer")'); // drawer panel: Cash out is the first choice
await page.locator('input[placeholder="Amount"]').fill("10");
await page.locator('input[placeholder="Reason"]').fill("e2e");
await page.click('section >> button:text-is("Save")');
await page.waitForSelector(".alert-ok, .alert-err", { timeout: 15000 });
ok("cash out recorded");
await page.click('button:text-is("Close shift")');
// expected: 100 + 70 + 90 (VIP) + 35 (quotation, paid cash) − 35 (refund) − 5 (expense) − 10 (cash out) = 245
await page.locator('input[placeholder*="Counted cash"]').fill("245");
await page.locator('section >> button:text-is("Close shift")').click();
await page.waitForSelector("text=Shift closed", { timeout: 15000 });
const closeTxt = await page.locator(".alert-ok").first().innerText();
if (!/Expected cash 245\.00/.test(closeTxt) || !/Difference 0\.00/.test(closeTxt)) fail("pos", `close: ${closeTxt}`); else ok("close shift: expected 245.00 (after the expense) = counted, difference 0.00");

// sales list
await page.goto(BASE + "/sales", { waitUntil: "networkidle" });
if (!(await page.locator("table").first().innerText()).includes(invoiceNo ?? "-")) fail("sales", "invoice not in the list"); else ok("Sales lists the invoice");
await page.goto(BASE + "/sales?tab=returns", { waitUntil: "networkidle" });
if (!/BR01-CN-/.test(await page.locator("table").first().innerText())) fail("sales", "credit note not in Returns"); else ok("Sales → Returns lists the credit note");

// language switch + logout + login
where = "language";
await page.goto(BASE + "/");
await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("[data-testid=lang-ar]")]);
await page.waitForFunction(() => document.documentElement.lang === "ar", null, { timeout: 15000 }).catch(() => {});
if ((await page.locator("html").getAttribute("dir")) !== "rtl") fail("language", "switch to Arabic did not change direction");
else ok("switch to Arabic");
await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("[data-testid=lang-en]")]);
await page.waitForFunction(() => document.documentElement.lang === "en", null, { timeout: 15000 }).catch(() => {});
if ((await page.locator("html").getAttribute("lang")) !== "en") fail("language", "switch back to English failed");
else ok("switch back to English");
where = "logout";
await Promise.all([page.waitForURL(/\/login/, { waitUntil: "commit", timeout: 30000 }), page.click("[data-testid=logout]")]);
ok("log out");
await page.fill('input[name="username"]', "owner");
await page.fill('input[name="password"]', "owner-password-123");
await Promise.all([page.waitForURL(BASE + "/", { waitUntil: "commit", timeout: 30000 }), page.click('form:has(input[name="password"]) button')]);
ok("log in again");
await page.goto(BASE + "/setup");
if (!page.url().includes("/login") && !page.url().endsWith("/")) fail("setup", "setup page still reachable after the owner exists");
else ok("setup page locks itself once the owner exists");
const state = await ctx.storageState();

// cashier sees only what a cashier may
where = "cashier";
const cctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const cp = await cctx.newPage();
watch(cp, () => where);
await cp.goto(BASE + "/login");
await cp.fill('input[name="username"]', "cashier1");
await cp.fill('input[name="password"]', "cashier-pass-1");
await Promise.all([cp.waitForURL(BASE + "/", { waitUntil: "commit", timeout: 30000 }), cp.click('form:has(input[name="password"]) button')]);
const nav = await cp.locator("[data-testid=sections]").innerText();
const navKeys = await cp.$$eval("[data-testid=sections] a", (as) => as.map((a) => a.getAttribute("data-section")));
if (navKeys.join(",") !== "pos,stock" || (await cp.locator("[data-testid=settings]").count())) fail("cashier", `cashier menu shows: ${nav.replace(/\s+/g, " ")}`);
else ok("cashier sees only Cashier and Stores, no settings");
await cp.goto(BASE + "/permissions");
await cp.waitForURL(/\/forbidden/, { timeout: 15000 }).catch(() => {}); // the redirect arrives in the streamed page (loading screen first)
if (!cp.url().includes("/forbidden")) fail("cashier", "cashier can open /permissions");
else ok("cashier is blocked from admin pages");
// without "Edit customers" the customer page has no edit form (cashiers can still add customers at the till)
await cp.goto(customerUrl, { waitUntil: "networkidle" });
if (await cp.locator("form#edit").count()) fail("cashier", "cashier sees the customer edit form without the permission");
else ok("customer edit form only for people given \"Edit customers\"");
await cctx.close();

// ---------------------------------------------------------------- 2. every page × desktop/phone × en/ar
for (const [device, opts] of [["desktop", { viewport: { width: 1280, height: 900 } }], ["phone", { ...devices["iPhone 13"] }]]) {
  for (const lang of ["en", "ar"]) {
    console.log(`\n== Every page: ${device}, ${lang}`);
    const c = await browser.newContext({ ...opts, storageState: state });
    const p = await c.newPage();
    let w = `${device}/${lang}`;
    watch(p, () => w);
    // set the language through the real button
    await p.goto(BASE + "/");
    const cur = await p.locator("html").getAttribute("lang");
    if (cur !== lang) {
      await Promise.all([p.waitForNavigation({ waitUntil: "load" }), p.click(`[data-testid=lang-${lang}]`)]);
      await p.waitForFunction((l) => document.documentElement.lang === l, lang, { timeout: 15000 }).catch(() => {});
    }
    if ((await p.locator("html").getAttribute("lang")) !== lang) fail(w, "could not switch language");
    const productId = await p.$eval("a[href^='/products/']", (a) => a.getAttribute("href")).catch(() => null);
    const pid = await (async () => {
      await p.goto(BASE + "/products");
      return p.$eval("tbody a[href^='/products/']", (a) => a.getAttribute("href")).catch(() => productId);
    })();
    for (const r of [...ROUTES, ...(pid ? [pid] : [])]) {
      w = `${device}/${lang} ${r}`;
      await checkPage(p, r, w);
      if (lang === "ar" && (await p.locator("html").getAttribute("dir")) !== "rtl") fail(w, "not right-to-left in Arabic");
      await p.screenshot({ path: `${OUT}/${device}-${lang}${r.replace(/[\/]/g, "_") || "_home"}.png`, fullPage: false });
    }
    // the 6 main sections: all on screen, each opens its page and is highlighted there
    w = `${device}/${lang} menu`;
    await p.goto(BASE + "/");
    const keys = await p.$$eval("[data-testid=sections] a", (as) => as.map((a) => a.getAttribute("data-section")));
    if (keys.join(",") !== "pos,stock,sales,products,customers,staff") fail(w, `main sections are ${keys.join(",")}`);
    for (const k of keys) {
      await p.click(`[data-testid=sections] a[data-section=${k}]`);
      await p.waitForFunction((key) => document.querySelector(`[data-testid=sections] a[data-section=${key}]`)?.getAttribute("aria-current") === "page", k, { timeout: 30000 }).catch(() => fail(w, `${k} not highlighted after opening it`));
    }
    ok(`${device}/${lang}: 6 main sections open their pages`);
    ok(`${device}/${lang}: ${ROUTES.length + 1} pages checked`);
    await c.close();
  }
}

await browser.close();
console.log(`\n${passed.length} checks passed, ${problems.length} problems`);
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ passed, problems }, null, 2));
process.exit(problems.length ? 1 : 0);
