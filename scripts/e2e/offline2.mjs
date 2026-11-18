// Offline everywhere: auto switch, desk quotation offline + QR slip scanned at the till, drawer
// expense offline, customer search offline; all sent when the connection is back.
// Usage: BASE=http://localhost:3105 CUSTOMER="name" node scripts/e2e/offline2.mjs   (owner / owner-password-123, English)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:3105';
const SKU = process.env.SKU || '100025';
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${m}`); };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(BASE + '/login');
await p.fill('input[name=username]', 'owner'); await p.fill('input[name=password]', 'owner-password-123');
await Promise.all([p.waitForURL(BASE + '/', { waitUntil: 'commit' }), p.locator('form button').last().click()]);
await p.goto(BASE + '/lang?to=en&next=/pos'); // the tests read English labels
await p.waitForSelector('[data-testid=offline-bar], button:text-is("Open shift")', { timeout: 30000 }).catch(() => {});
if (await p.getByRole('button', { name: 'Open shift' }).count()) await p.getByRole('button', { name: 'Open shift' }).click();
// the cashier opens on big tiles: go to the till
await p.waitForSelector('[data-tile=sell], [placeholder*="Scan barcode"]', { timeout: 20000 }).catch(() => {});
if (await p.locator('[data-tile=sell]').count()) await p.click('[data-tile=sell]');
if (!(await p.waitForSelector('[data-testid=offline-bar]', { timeout: 20000 }).catch(() => null))) {
  console.log(`✗ offline bar does not show\npage: ${p.url()}\n${(await p.locator('body').innerText()).slice(0, 1500)}`); await b.close(); process.exit(1);
}
const box = p.locator('[data-testid=offline-bar] input[type=checkbox]').first();
if (!(await box.isChecked())) await box.check();
await p.waitForFunction(() => /Price list on this device: \d+ items/.test(document.body.innerText), null, { timeout: 30000 });
await p.waitForFunction(() => !!localStorage.getItem('pos-customers-v1'), null, { timeout: 30000 });
ok(true, 'price list and customers copy saved on this device');

// connection lost → automatic switch
await ctx.setOffline(true);
await p.waitForFunction(() => document.querySelector('[data-testid=conn]')?.textContent?.includes('No internet'), null, { timeout: 20000 });
ok(true, 'switched to offline automatically');

// desk quotation offline → slip with QR
await p.getByRole('button', { name: 'Quotation', exact: true }).click();
const scan = p.getByPlaceholder(/Scan barcode/).first();
await scan.fill(SKU); await scan.press('Enter'); await p.waitForTimeout(300);
const popupP = ctx.waitForEvent('page', { timeout: 10000 }).catch(() => null);
await p.getByRole('button', { name: 'Save quotation' }).click();
await p.waitForSelector('text=/Quotation saved on this device/');
const msg = await p.locator('.alert-ok').first().innerText();
const tempNo = msg.match(/OFF-[A-Z0-9]+-[A-Z0-9]{4}-Q\d{4}/)?.[0];
ok(!!tempNo, `desk quotation saved offline: ${tempNo}`);
const slip = await popupP;
if (slip) { await slip.waitForLoadState(); await slip.waitForTimeout(500); ok((await slip.locator('img[src^="data:image/png"]').count()) === 1 && (await slip.content()).includes(tempNo), 'desk slip with QR prints offline'); await slip.close(); }
else ok(false, 'desk slip with QR prints offline');

// the till scans the slip's QR (a 2D scanner types its text)
const op = await p.evaluate(() => JSON.parse(localStorage.getItem('pos-offline-ops-v1'))?.find((x) => x.kind === 'quote'));
const qrText = `AHQ1|${op.tempNo}|${op.payload.lines.map((l) => [l.variantId, l.qty, l.unitPrice, l.discount || '0'].join(',')).join(';')}`;
await p.getByRole('button', { name: 'Sell', exact: true }).click();
const scan2 = p.getByPlaceholder(/Scan barcode/).first();
await scan2.fill(qrText); await scan2.press('Enter');
await p.waitForSelector('text=/Desk slip loaded/');
ok((await p.locator('tbody tr').count()) === 1, 'slip lines loaded at the till without a connection');

// customer search offline
if (process.env.CUSTOMER) {
  await p.getByPlaceholder('Mobile, name or customer no.').first().fill(process.env.CUSTOMER);
  await p.getByRole('button', { name: 'Find', exact: true }).first().click();
  await p.waitForSelector('[data-testid=customer]', { timeout: 5000 }).catch(() => {});
  ok((await p.locator('[data-testid=customer]').count()) === 1, 'customer found offline from the copy on this device');
}
const rp = ctx.waitForEvent('page', { timeout: 10000 }).catch(() => null);
await p.getByRole('button', { name: /^Pay/ }).click();
await p.waitForSelector('text=/Saved offline/');
const saleNo = (await p.locator('.alert-ok').first().innerText()).match(/OFF-[A-Z0-9]+-[A-Z0-9]{4}-\d{4}/)?.[0];
ok(!!saleNo, `slip sold offline: ${saleNo}`);
const r = await rp; if (r) await r.close();

// expense offline (Expenses screen)
await p.getByRole('button', { name: 'Expenses', exact: true }).click();
const ex = p.locator('[data-testid=expenses]');
await ex.locator('select').first().selectOption({ index: 1 });
await ex.locator('input[inputmode=decimal]').fill('3');
await ex.getByRole('button', { name: 'Save expense' }).click();
await p.waitForSelector('text=/Saved on this device/');
ok(/waiting for internet/.test(await ex.innerText()), 'expense saved offline and listed as waiting');
ok(/Waiting to send: 3/.test(await p.locator('[data-testid=offline-bar]').innerText()), 'three things waiting (quotation, sale, expense)');

// back online → everything is sent
await ctx.setOffline(false);
await p.waitForFunction(() => !/Waiting to send/.test(document.querySelector('[data-testid=offline-bar]')?.innerText ?? ''), null, { timeout: 60000 }).catch(() => {});
const left = await p.locator('[data-testid=offline-bar]').innerText();
ok(!/Waiting to send/.test(left), 'all sent when the connection is back ' + (left.match(/Not accepted.*/)?.[0] ?? ''));
console.log(`QUOTE_TEMP=${tempNo} SALE_TEMP=${saleNo}`);
ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
console.log(`\n${bad} problems`);
await b.close();
process.exit(bad ? 1 : 0);
