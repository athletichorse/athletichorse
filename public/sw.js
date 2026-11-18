/*
 * Service worker for the staff portal.
 * Purpose: the Cashier page (/pos) and the stock screens (receive, transfer, count,
 * write-off, count sheet) open even without internet; the pages queue their own work
 * and send it later.
 *  - /_next/static, /icons and /brand (logo): cache-first (file names change on every update).
 *  - /pos and the stock screens: network-first; the last good copy is kept for offline use.
 *  - other pages offline: the saved Cashier page, or a short "no internet" page.
 *  - opening /login (logged out) forgets the saved pages.
 * Nothing else is cached: data always comes from the server.
 */
const VERSION = "v3";
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const OFFLINE_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f6f7f9;color:#111827;text-align:center}
a{display:inline-block;margin-top:16px;padding:10px 18px;border-radius:8px;background:#0f6b4f;color:#fff;text-decoration:none}</style></head>
<body><div><h1>No internet · لا يوجد إنترنت</h1><p>Open the cashier to keep selling offline.<br>افتح الكاشير لمتابعة البيع بدون إنترنت.</p><a href="/pos">Cashier · الكاشير</a></div></body></html>`;

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(STATIC)).put(req, res.clone());
  return res;
}

/** Pages kept for offline use: the cashier and the stock screens (by path + kind). */
function savedKey(url) {
  if (url.pathname === "/pos") return "/pos";
  if (url.pathname === "/stock/count") return "/stock/count";
  if (url.pathname === "/stock/new") {
    const kind = url.searchParams.get("kind") || "receipt";
    return ["receipt", "transfer", "count", "write_off"].includes(kind) && !url.searchParams.get("request") ? `/stock/new?kind=${kind}` : null;
  }
  return null;
}

async function savedPage(req, key) {
  try {
    const res = await fetch(req);
    if (res.ok && !res.redirected) (await caches.open(PAGES)).put(key, res.clone());
    return res;
  } catch {
    return (await caches.match(key)) || (await caches.match("/pos")) || new Response(OFFLINE_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
}

async function otherPage(req) {
  try {
    return await fetch(req);
  } catch {
    return (await caches.match("/pos")) || new Response(OFFLINE_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/")) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (req.mode !== "navigate") return;
  if (url.pathname === "/login" || url.pathname === "/setup") {
    event.waitUntil(caches.delete(PAGES));
    return;
  }
  const key = savedKey(url);
  event.respondWith(key ? savedPage(req, key) : otherPage(req));
});
