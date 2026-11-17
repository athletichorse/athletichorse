// Offline till click-through (local test database only, never the live app).
// Usage: BASE=http://localhost:3105 node scripts/e2e/offline.mjs <sku>   (owner / owner-password-123, English)
import { createRequire } from 'node:module';
// Playwright is pre-installed globally on the test machine (require resolves it; ESM import does not).
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:3105';
const SKU = process.argv[2] || '100025';
const results = [];
/** The cashier opens on big tiles: go to the till (Point of sale) when they show. */
async function toSell(p) {
  await p.waitForSelector('[data-tile=sell], [placeholder*="Scan barcode"]', { timeout: 15000 }).catch(() => {});
  if (await p.locator('[data-tile=sell]').count()) await p.click('[data-tile=sell]');
}
const ok = (cond, msg) => { results.push(`${cond ? '✓' : '✗'} ${msg}`); console.log(`${cond ? '✓' : '✗'} ${msg}`); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + '/login');
  await p.fill('input[name=username]', 'owner');
  await p.fill('input[name=password]', 'owner-password-123');
  await Promise.all([p.waitForURL(BASE + '/', { waitUntil: 'commit' }), p.locator('form button').last().click()]);
  await p.goto(BASE + '/lang?to=en&next=/pos'); // the tests read English labels
  // wait until the cashier page shows either the till or the "Open shift" button
  await p.waitForSelector('[data-testid=offline-bar], button:text-is("Open shift")', { timeout: 30000 }).catch(() => {});
  if (await p.getByRole('button', { name: 'Open shift' }).count()) {
    await p.getByRole('button', { name: 'Open shift' }).click();
    await p.waitForSelector('[data-testid=offline-bar]', { timeout: 20000 });
  }
  await p.waitForSelector('[data-testid=offline-bar]', { timeout: 20000 }).catch(() => {});
  const barShown = await p.locator('[data-testid=offline-bar]').isVisible();
  ok(barShown, 'offline bar shows on the cashier for the owner');
  if (!barShown) { console.log(`page: ${p.url()}\n${(await p.locator('body').innerText()).slice(0, 1500)}`); await b.close(); process.exit(1); }

  // turn on offline for this device → price list is downloaded
  const box = p.locator('[data-testid=offline-bar] input[type=checkbox]');
  if (!(await box.isChecked())) await box.check();
  await p.waitForFunction(() => /Price list on this device: \d+ items/.test(document.body.innerText), null, { timeout: 30000 });
  const listText = await p.locator('[data-testid=offline-bar]').innerText();
  ok(/Price list on this device: \d+ items/.test(listText), `price list saved on device (${listText.match(/\d+ items/)?.[0]})`);

  // service worker active + /pos saved
  await p.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker?.ready, null, { timeout: 15000 });
  await p.reload();
  await p.waitForSelector('[data-testid=offline-bar]');
  const cached = await p.evaluate(async () => !!(await caches.match('/pos')));
  ok(cached, 'cashier page saved for offline use by the service worker');

  // ---- go offline
  await ctx.setOffline(true);
  await p.reload().catch(() => {});
  await p.waitForSelector('[data-testid=offline-bar]', { timeout: 20000 }).catch(() => {});
  ok(await p.locator('[data-testid=offline-bar]').isVisible(), 'cashier page opens with no internet (reload while offline)');
  await toSell(p);
  await p.waitForFunction(() => document.body.innerText.includes('No internet'), null, { timeout: 10000 }).catch(() => {});
  ok((await p.locator('body').innerText()).includes('No internet — sales are saved on this device'), 'shows the "No internet" status');

  const search = p.getByPlaceholder(/Scan barcode/);
  await search.fill(SKU); await search.press('Enter');
  await search.fill(SKU); await search.press('Enter');
  await p.waitForTimeout(300);
  const qty = await p.locator('table input').first().inputValue().catch(() => '');
  ok(qty === '2', `offline scan from the device price list (qty ${qty})`);
  const unit = await p.locator('table input').nth(1).inputValue().catch(() => '0');
  const total = (Number(unit) * 2).toFixed(2);

  const [popup] = await Promise.all([
    ctx.waitForEvent('page', { timeout: 10000 }).catch(() => null),
    p.getByRole('button', { name: /^Pay/ }).click(),
  ]);
  await p.waitForTimeout(500);
  const body = await p.locator('body').innerText();
  const temp = body.match(/OFF-BR0\d-[A-Z0-9]{4}-\d{4}/)?.[0];
  ok(!!temp && body.includes('Saved offline'), `offline sale saved with temporary number ${temp}`);
  if (popup) {
    await popup.waitForLoadState().catch(() => {});
    const rt = await popup.locator('body').innerText().catch(() => '');
    ok(rt.includes('Temporary receipt') && rt.includes(temp) && rt.includes(total), `temporary receipt opens for printing (number, total ${total}, note)`);
    await popup.close();
  } else ok(false, 'temporary receipt window opened');
  ok(/Waiting to send: 1/.test(await p.locator('[data-testid=offline-bar]').innerText()), 'queue shows 1 sale waiting');

  // closing the shift is blocked while a sale waits
  await p.getByRole('button', { name: 'Close shift' }).first().click();
  await p.getByPlaceholder('Counted cash (SAR)').fill('14');
  await p.locator('section button.btn-primary', { hasText: 'Close shift' }).click();
  await p.waitForTimeout(500);
  ok((await p.locator('body').innerText()).includes("haven't been sent yet"), 'closing the shift waits for offline sales to be sent');

  // ---- back online → sent automatically
  await ctx.setOffline(false);
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  await p.waitForFunction(() => /Sent offline sales \(\d+\)/.test(document.body.innerText) && !/Waiting to send/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
  const bar = await p.locator('[data-testid=offline-bar]').innerText();
  ok(/Sent offline sales \(\d+\)/.test(bar) && !/Waiting to send/.test(bar), 'sent automatically when the internet is back');
  await p.locator('[data-testid=offline-bar] summary').click();
  const link = await p.locator('[data-testid=offline-bar] details a').first().innerText();
  ok(/^BR0\d-\d{6}$/.test(link), `temporary number linked to the real tax invoice ${link}`);
  console.log('TEMP=' + temp + ' INV=' + link);

  // ---- return without internet, using the copy of recent receipts kept on this device
  await p.locator('[data-testid=offline-bar]').getByRole('button', { name: 'Update price list' }).click();
  await p.waitForSelector('[data-testid=receipts-copy]', { timeout: 30000 }).catch(() => {});
  ok(await p.locator('[data-testid=receipts-copy]').isVisible(), 'recent receipts copied to this device');
  await ctx.setOffline(true);
  await p.evaluate(() => window.dispatchEvent(new Event('offline')));
  await p.waitForFunction(() => document.querySelector('[data-testid=conn]')?.textContent?.includes('No internet'), null, { timeout: 20000 }).catch(() => {});
  await p.getByRole('button', { name: 'Return', exact: true }).click();
  await p.getByPlaceholder(/Invoice number/).fill(link);
  await p.getByRole('button', { name: 'Find', exact: true }).click();
  await p.waitForSelector('table tbody tr input', { timeout: 10000 }).catch(() => {});
  ok((await p.locator('table tbody tr').count()) >= 1, 'receipt found on this device with no internet');
  await p.locator('table tbody tr input').first().fill('1');
  const half = (Number(total) / 2).toFixed(2);
  const [slip] = await Promise.all([
    ctx.waitForEvent('page', { timeout: 10000 }).catch(() => null),
    p.getByRole('button', { name: 'Refund', exact: true }).click(),
  ]);
  await p.waitForSelector('text=/Return saved on this device/', { timeout: 10000 }).catch(() => {});
  const rmsg = await p.locator('.alert-ok, .alert-err').first().innerText().catch(() => '');
  const rtemp = rmsg.match(/OFF-BR0\d-[A-Z0-9]{4}-R\d{4}/)?.[0];
  ok(!!rtemp && rmsg.includes(half), `offline return saved: ${rtemp}, refund ${half} (${rmsg})`);
  if (slip) {
    await slip.waitForLoadState().catch(() => {});
    const st = await slip.locator('body').innerText().catch(() => '');
    ok(st.includes('Temporary return slip') && st.includes(rtemp ?? '?') && st.includes(half), 'return slip prints offline');
    await slip.close();
  } else ok(false, 'return slip window opened');
  // the same receipt: only 1 left to return now
  await p.getByRole('button', { name: 'Find', exact: true }).click();
  await p.waitForTimeout(300);
  const left = (await p.locator('table tbody tr').first().locator('td').nth(1).innerText()).trim();
  ok(left === '1', `returned quantity taken off the receipt on this device (left: ${left})`);
  await ctx.setOffline(false);
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  await p.waitForFunction(() => !/Waiting to send/.test(document.querySelector('[data-testid=offline-bar]')?.textContent ?? ''), null, { timeout: 30000 }).catch(() => {});
  await p.locator('[data-testid=offline-bar] details summary').click().catch(() => {});
  const sentTxt = await p.locator('[data-testid=offline-bar]').innerText();
  ok(!/Waiting to send/.test(sentTxt) && /BR0\d-CN-\d{6}/.test(sentTxt), `return sent when the internet is back → credit note ${sentTxt.match(/BR0\d-CN-\d{6}/)?.[0]}`);

  ok(errs.length === 0, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  await b.close();
  const bad = results.filter((r) => r.startsWith('✗')).length;
  console.log(`\n${bad} problems`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('✗ crashed: ' + e.message.split('\n')[0]); process.exit(1); });
