#!/usr/bin/env node
/**
 * DEV/TEST ONLY — full UI audit. Run after crawl.mjs (needs its data). For every page
 * (fixed routes + one of each detail page found by following links), on desktop and phone,
 * in English and Arabic:
 *   - page answers, no error page, no JS/console errors, nothing wider than the screen
 *   - every link, button and field is on screen (not cut off left/right) and not covered
 *   - headings, tabs, buttons and table headers are not cut off
 *   - every link answers (no 404/500)
 *   - every button that works in the page (not a form submit) can be clicked without errors
 *   - every form, sent as it is, gives a message the person can SEE (in the visible part of the screen)
 * Usage: BASE=http://localhost:3105 OUT=/tmp/shots node scripts/e2e/audit.mjs
 */
import { createRequire } from "node:module";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";

const BASE = process.env.BASE || "http://localhost:3105";
const OUT = process.env.OUT || "/tmp/e2e-shots";
const USER = process.env.AUDIT_USER || "owner";
const PASS = process.env.AUDIT_PASS || "owner-password-123";
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
fs.mkdirSync(OUT, { recursive: true });

const problems = new Map(); // de-duplicated: same problem on several pages/views counts once per page
const fail = (where, what) => {
  const k = `${where}: ${what}`;
  if (!problems.has(k)) { problems.set(k, 1); console.log(`  ✗ ${k}`); }
};

const ROUTES = ["/", "/products", "/products/new", "/products/groups", "/products/labels", "/staff", "/staff/employees", "/staff/attendance",
  "/staff/payroll", "/staff/commission", "/staff/advances", "/staff/slips", "/locations", "/company", "/permissions", "/upload", "/pos", "/pos/shifts", "/pos/day",
  "/stock", "/stock/new?kind=receipt", "/stock/new?kind=transfer", "/stock/new?kind=count", "/stock/new?kind=write_off", "/stock/docs", "/stock/count",
  "/stock/requests", "/stock/requests/quick", "/stock/shortages", "/sales", "/sales?tab=returns", "/sales?tab=website", "/sales/reports", "/customers",
  "/stock-log", "/audit", "/audit/hours", "/audit/devices"];
// never pressed by the audit (they end the session or change who can log in)
const SKIP_CLICK = /log ?out|تسجيل الخروج|English|العربية/i;

const VIEWS = [
  { name: "desktop-en", locale: "en", opts: { viewport: { width: 1280, height: 900 } } },
  { name: "phone-en", locale: "en", opts: { ...devices["iPhone 13"] } },
  { name: "desktop-ar", locale: "ar", opts: { viewport: { width: 1280, height: 900 } } },
  { name: "phone-ar", locale: "ar", opts: { ...devices["iPhone 13"] } },
];

const browser = await chromium.launch();

async function login(view) {
  const ctx = await browser.newContext({ ...view.opts, acceptDownloads: true });
  // printing and new windows would block the audit: record instead of opening
  await ctx.addInitScript(() => { window.print = () => {}; const o = window.open; window.open = (...a) => { try { return o.apply(window, a); } catch { return null; } }; });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept().catch(() => {}));
  await page.goto(BASE + "/login");
  await page.fill("input[name=username]", USER);
  await page.fill("input[name=password]", PASS);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { waitUntil: "commit", timeout: 30000 }), page.locator("form button").last().click()]);
  await page.goto(`${BASE}/lang?to=${view.locale}&next=/`);
  return { ctx, page };
}

let where = "";
function watch(page) {
  page.on("pageerror", (e) => fail(where, `JS error: ${e.message.slice(0, 160)}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon|DevTools|net::ERR_ABORTED|ERR_TUNNEL_CONNECTION_FAILED|ERR_NAME_NOT_RESOLVED|cdn\.shopify|status of 4\d\d/.test(m.text())) fail(where, `console: ${m.text().slice(0, 160)}`);
  });
  page.on("response", (r) => { const u = new URL(r.url()); if (u.origin === BASE && r.status() >= 500) fail(where, `HTTP ${r.status()} ${u.pathname}`); });
  page.on("popup", (p) => p.close().catch(() => {}));
}

/** Layout checks in the page: off-screen, covered and cut-off elements. */
async function layoutProblems(page) {
  return page.evaluate(() => {
    const out = [];
    const vw = document.documentElement.clientWidth;
    const name = (el) => (el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || el.getAttribute("name") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !el.closest("[hidden],[aria-hidden=true],.print-only,dialog:not([open])") && !(el.closest("details:not([open])") && !el.closest("summary")); };
    const inScroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
    const inClosedMenu = (el) => { const r = el.getBoundingClientRect(); return r.right <= 0 || r.left >= vw; };
    if (document.documentElement.scrollWidth > vw + 1) out.push(`page is wider than the screen (${document.documentElement.scrollWidth}px > ${vw}px)`);
    // a row of buttons/links that slides sideways hides some of them (tables may scroll, rows of choices may not)
    for (const el of document.querySelectorAll("div, nav, ul")) {
      if (!visible(el) || el.querySelector("table")) continue;
      const st = getComputedStyle(el);
      if (/(auto|scroll)/.test(st.overflowX) && el.scrollWidth > el.clientWidth + 2 && el.querySelector("a, button")) out.push(`row "${name(el).slice(0, 30)}" slides sideways — some choices are off screen`);
    }
    const items = [...document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea")].filter(visible);
    for (const el of items.slice(0, 400)) {
      const r = el.getBoundingClientRect();
      if (inClosedMenu(el) && el.closest("aside, [data-drawer]")) continue; // slide-in menu while closed
      if (!inScroller(el) && (r.left < -1 || r.right > vw + 1)) out.push(`"${name(el)}" is cut off at the screen edge`);
    }
    // covered: check the middle of each control after scrolling it into view
    for (const el of items.slice(0, 250)) {
      if (inScroller(el) || el.disabled) continue;
      const r0 = el.getBoundingClientRect();
      if (r0.right <= 0 || r0.left >= vw) continue;
      el.scrollIntoView({ block: "center", inline: "nearest" });
      const r = el.getBoundingClientRect();
      const x = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1), y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      if (top && top !== el && !el.contains(top) && !top.contains(el) && !(el.labels && [...el.labels].some((l) => l.contains(top)))) {
        out.push(`"${name(el)}" is covered by <${top.tagName.toLowerCase()} class="${String(top.className).slice(0, 40)}">`);
      }
    }
    window.scrollTo(0, 0);
    // cut-off text in headings, tabs, buttons, table headers
    for (const el of document.querySelectorAll("h1, h2, h3, nav a, button, th, label")) {
      if (!visible(el) || el.closest(".truncate, [data-truncate]") || el.classList.contains("truncate")) continue;
      const s = getComputedStyle(el);
      if (/(hidden|clip)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 2) out.push(`text of "${name(el)}" is cut off`);
    }
    return out;
  });
}

/** After sending a form: if the page shows a message, it must be inside the visible part of the screen. */
async function messageVisible(page) {
  return page.evaluate(() => {
    const msgs = [...document.querySelectorAll(".alert-ok, .alert-err")].filter((e) => e.getBoundingClientRect().height > 0);
    if (!msgs.length) return { any: false, seen: false };
    const h = window.innerHeight;
    return { any: true, seen: msgs.some((e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < h; }), text: msgs[0].innerText.slice(0, 80) };
  });
}

// ---------------------------------------------------------------- find detail pages (one of each kind)
const first = await login(VIEWS[0]);
watch(first.page);
const pattern = (p) => p.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id").replace(/\/\d+(?=\/|$|\?)/g, "/:n");
const pages = new Map(ROUTES.map((r) => [pattern(r), r]));
const links = new Set();
for (const r of ROUTES) {
  where = `links ${r}`;
  await first.page.goto(BASE + r, { waitUntil: "networkidle" });
  for (const h of await first.page.$$eval("a[href^='/']", (as) => as.map((a) => a.getAttribute("href")))) {
    if (h.startsWith("/lang")) continue;
    links.add(h.split("#")[0]);
    const path = h.split("#")[0];
    if (!pages.has(pattern(path)) && !/print=1|\.xlsx|\/api\//.test(path)) pages.set(pattern(path), path);
  }
}
for (const h of links) {
  const res = await first.page.request.get(BASE + h, { maxRedirects: 0 });
  if (res.status() >= 400) fail("links", `${h} → HTTP ${res.status()}`);
}
console.log(`checked ${links.size} links; auditing ${pages.size} pages × ${VIEWS.length} views`);
await first.ctx.close();

// ---------------------------------------------------------------- every page, every view
const list = [...pages.values()].filter((p) => !ONLY || ONLY.test(p));
for (const view of VIEWS) {
  console.log(`\n== ${view.name}`);
  const { ctx, page } = await login(view);
  watch(page);
  for (const path of list) {
    where = `${view.name} ${path}`;
    const res = await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => null);
    if (!res || res.status() >= 400) { fail(where, `HTTP ${res?.status() ?? "no answer"}`); continue; }
    const text = await page.locator("body").innerText();
    if (/Application error|Unhandled Runtime Error|Internal Server Error|This page couldn.t load/i.test(text)) fail(where, "shows an error page");
    for (const p of await layoutProblems(page)) fail(where, p);
    if (view.name === "phone-en" || view.name === "desktop-ar") await page.screenshot({ path: `${OUT}/audit-${view.name}${path.replace(/[/?=&]/g, "_")}.png`, fullPage: true }).catch(() => {});

    // buttons that work inside the page (not form submits): each one, from a fresh page
    if (view.name === "desktop-en" || view.name === "phone-ar") {
      const count = await page.locator("button:visible").count();
      for (let i = 0; i < Math.min(count, 40); i++) {
        await page.goto(BASE + path, { waitUntil: "networkidle" });
        const b = page.locator("button:visible").nth(i);
        if (!(await b.count())) break;
        const info = await b.evaluate((el) => ({ text: (el.getAttribute("aria-label") || el.innerText).trim().slice(0, 40), submit: el.type === "submit" && !!el.form, disabled: el.disabled }));
        if (info.submit || info.disabled || SKIP_CLICK.test(info.text)) continue;
        where = `${view.name} ${path} [${info.text}]`;
        await b.click({ timeout: 5000 }).catch((e) => fail(where, `can't be clicked: ${e.message.split("\n")[0].slice(0, 120)}`));
        await page.waitForTimeout(250);
      }
    }

    // every form, sent as it is: the answer must be visible on screen
    if (view.name === "desktop-en" || view.name === "phone-en") {
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      const forms = await page.locator("form:visible").count();
      for (let i = 0; i < Math.min(forms, 25); i++) {
        await page.goto(BASE + path, { waitUntil: "networkidle" });
        const f = page.locator("form:visible").nth(i);
        if (!(await f.count())) break;
        const btn = f.locator("button[type=submit]:visible, button:not([type]):visible").last();
        if (!(await btn.count()) || (await btn.isDisabled())) continue;
        const label = (await btn.innerText()).trim().slice(0, 40);
        if (SKIP_CLICK.test(label)) continue;
        // search/filter forms (GET) just show the page again with the filter
        const method = ((await f.getAttribute("method")) ?? "").toLowerCase(), action = (await f.getAttribute("action")) ?? "";
        if (method === "get" || (method === "" && action.startsWith("/"))) continue;
        where = `${view.name} ${path} form "${label}"`;
        const before = page.url();
        const textBefore = await page.locator("main").innerText().catch(() => "");
        await btn.click({ timeout: 5000 }).catch(() => {});
        // slow actions (website, sync) can take a while: wait for an answer, up to 45 s
        await page.waitForFunction((u) => location.href !== u || document.querySelector(".alert-ok, .alert-err"), before, { timeout: 45000 }).catch(() => {});
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(800);
        const m = await messageVisible(page);
        if (m.any && !m.seen) fail(where, `the message ("${m.text}") is not visible on screen after sending`);
        const changed = (await page.locator("main").innerText().catch(() => "")) !== textBefore;
        if (!m.any && page.url() === before && !changed) {
          // nothing visible happened: a browser check (required field) is fine, otherwise the person gets no answer
          const invalid = await f.evaluate((el) => !el.checkValidity()).catch(() => false);
          if (!invalid) fail(where, "no message and nothing changed after sending");
        }
      }
    }
  }
  await ctx.close();
}

await browser.close();
console.log(`\n${problems.size} problems`);
process.exit(problems.size ? 1 : 0);
