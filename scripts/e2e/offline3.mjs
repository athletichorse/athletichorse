// Stock screens without internet (local test database only, never the live app).
// Usage: BASE=http://localhost:3105 SKU=<item code> node scripts/e2e/offline3.mjs   (owner / owner-password-123)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE || 'http://localhost:3105';
const SKU = process.env.SKU || '100025';
const results = [];
const ok = (cond, msg) => { results.push(`${cond ? '✓' : '✗'} ${msg}`); console.log(`${cond ? '✓' : '✗'} ${msg}`); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + '/login');
  await p.fill('input[name=username]', 'owner'); await p.fill('input[name=password]', 'owner-password-123');
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login'), { waitUntil: 'commit' }), p.locator('form button').last().click()]);
  const docRows = async () => { await p.goto(BASE + '/stock/docs', { waitUntil: 'networkidle' }); return p.locator('main table tbody tr').count(); };
  const before = await docRows();

  // online once: the pages are kept for offline use and the item list is copied to the device
  await p.goto(BASE + '/lang?to=en&next=/stock/count', { waitUntil: 'networkidle' });
  await p.goto(BASE + '/stock/new?kind=receipt', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 20000 }).catch(() => {});
  await p.reload({ waitUntil: 'networkidle' }); // now through the service worker → saved
  await p.goto(BASE + '/stock/count', { waitUntil: 'networkidle' });
  await p.goto(BASE + '/stock/new?kind=receipt', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => (JSON.parse(localStorage.getItem('pos-catalog-v1') || '{}').items || []).length > 0, null, { timeout: 30000 }).catch(() => {});
  ok(await p.evaluate(async () => !!(await caches.match('/stock/new?kind=receipt')) && !!(await caches.match('/stock/count'))), 'stock screens saved for offline use');
  ok(await p.evaluate(() => (JSON.parse(localStorage.getItem('pos-catalog-v1') || '{}').items || []).length > 0), 'item list copied to this device');

  // ---- no internet: a receipt
  await ctx.setOffline(true);
  await p.reload().catch(() => {});
  await p.waitForSelector('input[placeholder*="SKU"]', { timeout: 20000 }).catch(() => {});
  ok(await p.locator('input[placeholder*="SKU"]').isVisible(), 'receiving screen opens with no internet');
  const box = p.locator('input[placeholder*="SKU"]').first();
  await box.fill(SKU); await box.press('Enter');
  await p.waitForSelector('main table tbody tr input', { timeout: 10000 }).catch(() => {});
  ok((await p.locator('main table tbody tr').count()) === 1, `item ${SKU} found in the copy on this device`);
  await p.locator('main table tbody tr input').first().fill('2');
  await p.getByRole('button', { name: 'Post', exact: true }).click();
  await p.waitForSelector('text=/saved on this device/', { timeout: 10000 }).catch(() => {});
  ok(/saved on this device/.test(await p.locator('main').innerText()), 'receipt saved on this device');
  ok(/waiting for internet: 1/.test(await p.locator('[data-testid=stock-queue]').innerText().catch(() => '')), 'shows 1 document waiting');

  // ---- no internet: a count sheet
  await p.goto(BASE + '/stock/count').catch(() => {});
  await p.waitForSelector('main table tbody tr input', { timeout: 20000 }).catch(() => {});
  ok((await p.locator('main table tbody tr input').count()) > 0, 'count sheet opens with no internet');
  await p.locator('main table tbody tr input').first().fill('5');
  await p.getByRole('button', { name: /Save count/ }).click();
  await p.waitForSelector('text=/saved on this device/', { timeout: 10000 }).catch(() => {});
  ok(/waiting for internet: 2/.test(await p.locator('[data-testid=stock-queue]').innerText().catch(() => '')), 'count saved too: 2 documents waiting');

  // ---- back online: sent automatically, posted once
  await ctx.setOffline(false);
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  await p.waitForFunction(() => !localStorage.getItem('stock-offline-queue-v1'), null, { timeout: 30000 }).catch(() => {});
  ok(!(await p.evaluate(() => localStorage.getItem('stock-offline-queue-v1'))), 'both sent when the internet is back');
  const after = await docRows();
  ok(after === before + 2, `posted exactly once each (${before} → ${after} documents)`);
  ok(errs.length === 0, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  await b.close();
  const bad = results.filter((r) => r.startsWith('✗')).length;
  console.log(`\n${bad} problems`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('✗ crashed: ' + e.message.split('\n')[0]); process.exit(1); });
