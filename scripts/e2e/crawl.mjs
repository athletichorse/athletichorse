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
const ROUTES = ["/", "/products", "/products/new", "/products/groups", "/staff", "/locations", "/company", "/permissions", "/upload", "/pos", "/stock", "/stock/new?kind=receipt", "/stock/new?kind=transfer", "/stock/new?kind=count", "/sales", "/sales/reports", "/sales?tab=returns", "/sales?tab=website", "/pos/shifts", "/pos/day", "/stock/docs", "/stock/count", "/stock/requests", "/stock/requests/quick", "/stock/shortages", "/products/labels", "/customers", "/stock-log", "/audit"];

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
await Promise.all([page.waitForURL(/\/products\/[0-9a-f-]{36}\?ok=1/), page.click('button:text-is("Add")')]);
ok("create a new product");
where = "groups";
await page.goto(BASE + "/products/groups");
const gForm = page.locator("form").filter({ has: page.locator('button:text-is("Add")') });
await gForm.locator('input[name="name_en"]').fill("Jump Ropes");
await gForm.locator('input[name="name_ar"]').fill("حبال القفز");
await Promise.all([page.waitForURL(/ok=1|err=/, { waitUntil: "commit", timeout: 30000 }), gForm.locator('button:text-is("Add")').click()]);
if (page.url().includes("err=")) fail("groups", decodeURIComponent(page.url().split("err=")[1]));
else ok("add a product group");

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
const trNo = (m2.match(/#(\d+)/) ?? [])[1];
await page.goto(BASE + "/stock/docs?status=in_transit", { waitUntil: "networkidle" });
await page.locator(`a:has-text("#${trNo}")`).first().click();
await page.waitForSelector("[data-testid=receive]", { timeout: 15000 });
await page.click('button:text-is("Receive transfer")');
await page.waitForFunction(() => document.body.innerText.includes("Received"), null, { timeout: 20000 });
ok("transfer received at Jeddah");
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

// cash out, close shift
await page.click('button:text-is("Drawer")'); // drawer panel: Cash out is the first choice
await page.locator('input[placeholder="Amount"]').fill("10");
await page.locator('input[placeholder="Reason"]').fill("e2e");
await page.click('section >> button:text-is("Save")');
await page.waitForSelector(".alert-ok, .alert-err", { timeout: 15000 });
ok("cash out recorded");
await page.click('button:text-is("Close shift")');
// expected: 100 + 70 + 35 (quotation, paid cash) − 35 (refund) − 10 (cash out) = 160
await page.locator('input[placeholder*="Counted cash"]').fill("160");
await page.locator('section >> button:text-is("Close shift")').click();
await page.waitForSelector("text=Shift closed", { timeout: 15000 });
const closeTxt = await page.locator(".alert-ok").first().innerText();
if (!/Expected cash 160\.00/.test(closeTxt) || !/Difference 0\.00/.test(closeTxt)) fail("pos", `close: ${closeTxt}`); else ok("close shift: expected 160.00 = counted, difference 0.00");

// sales list
await page.goto(BASE + "/sales", { waitUntil: "networkidle" });
if (!(await page.locator("table").first().innerText()).includes(invoiceNo ?? "-")) fail("sales", "invoice not in the list"); else ok("Sales lists the invoice");
await page.goto(BASE + "/sales?tab=returns", { waitUntil: "networkidle" });
if (!/BR01-CN-/.test(await page.locator("table").first().innerText())) fail("sales", "credit note not in Returns"); else ok("Sales → Returns lists the credit note");

// language switch + logout + login
where = "language";
await page.goto(BASE + "/");
await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("aside >> text=العربية")]);
await page.waitForFunction(() => document.documentElement.lang === "ar", null, { timeout: 15000 }).catch(() => {});
if ((await page.locator("html").getAttribute("dir")) !== "rtl") fail("language", "switch to Arabic did not change direction");
else ok("switch to Arabic");
await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("aside >> text=English")]);
await page.waitForFunction(() => document.documentElement.lang === "en", null, { timeout: 15000 }).catch(() => {});
if ((await page.locator("html").getAttribute("lang")) !== "en") fail("language", "switch back to English failed");
else ok("switch back to English");
where = "logout";
await Promise.all([page.waitForURL(/\/login/, { waitUntil: "commit", timeout: 30000 }), page.click("aside >> text=Log out")]);
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
const nav = await cp.locator("aside nav").innerText();
if (/Permissions|Company details/.test(nav)) fail("cashier", "cashier sees admin menu");
else ok("cashier menu hides admin pages");
await cp.goto(BASE + "/permissions");
await cp.waitForURL(/\/forbidden/, { timeout: 15000 }).catch(() => {}); // the redirect arrives in the streamed page (loading screen first)
if (!cp.url().includes("/forbidden")) fail("cashier", "cashier can open /permissions");
else ok("cashier is blocked from admin pages");
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
      const scope = device === "phone" ? '[role="dialog"]' : "aside";
      if (device === "phone") await p.click('button[aria-label="Open menu"], button[aria-label="فتح القائمة"]');
      await Promise.all([p.waitForNavigation({ waitUntil: "load" }), p.click(`${scope} >> text=${lang === "ar" ? "العربية" : "English"}`)]);
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
    if (device === "phone") {
      w = `${device}/${lang} menu`;
      await p.goto(BASE + "/");
      await p.click('button[aria-label="Open menu"], button[aria-label="فتح القائمة"]');
      const drawer = p.locator('[role="dialog"]');
      await drawer.waitFor();
      await drawer.locator("a[href='/products']").click();
      await p.waitForURL(/\/products/, { waitUntil: "commit", timeout: 30000 });
      if (await drawer.isVisible()) fail(w, "drawer stays open after choosing a page");
      else ok(`${device}/${lang}: phone menu opens, navigates and closes`);
    }
    ok(`${device}/${lang}: ${ROUTES.length + 1} pages checked`);
    await c.close();
  }
}

await browser.close();
console.log(`\n${passed.length} checks passed, ${problems.length} problems`);
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ passed, problems }, null, 2));
process.exit(problems.length ? 1 : 0);
