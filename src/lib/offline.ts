/**
 * Offline till (browser side). Everything here runs on the cashier's device.
 *
 *  - Per-device switch: offline sales are only allowed on devices where a
 *    manager turned them on (Cashier → "Allow offline sales on this device").
 *  - Price list: a copy of the active items and prices is kept on the device so
 *    scanning and searching keep working without a connection.
 *  - Queue: a sale made offline is saved with its client_id, a temporary number
 *    and the time it happened. When the connection is back it is sent with the
 *    same client_id, so a retry can never create a second invoice. The server
 *    recomputes every amount and gives the real ZATCA invoice number.
 *
 * Storage is localStorage behind small helpers; every read/write is guarded.
 */

export type CatalogItem = {
  v: string;        // variant id
  n: string;        // name (current language)
  o: string;        // options, e.g. "Red / XL"
  s: string | null; // SKU (= barcode)
  c: string[];      // extra codes
  p: string;        // VAT-inclusive price
  x: boolean;       // service item
};
export type Catalog = { savedAt: string; locale: string; items: CatalogItem[] };

export type QueuedSale = {
  clientId: string;
  tempNo: string;
  createdAt: string;   // when the sale happened (becomes the invoice time)
  locationId: string;
  shiftId: string;
  total: string;
  payload: {
    salespersonId?: string;
    customerId?: string;
    lines: { variantId: string; qty: string; unitPrice: string; discount: string }[];
    payments: { method: string; amount: string }[];
    cashTendered?: string;
  };
  lines: { name: string; qty: string; price: string; discount: string }[]; // for the temporary receipt
  error?: string;      // last refusal from the server (not a network error)
};
export type SentSale = { tempNo: string; number: string; invoiceId: string; sentAt: string };

export type Store = { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void };

const K = {
  enabled: "pos-offline-enabled",
  device: "pos-device-id",
  seq: "pos-offline-seq",
  catalog: "pos-catalog-v1",
  queue: "pos-offline-queue-v1",
  sent: "pos-offline-sent-v1",
  screen: "pos-device-screen",
};

export function browserStore(): Store {
  return {
    get: (k) => { try { return window.localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* full or blocked */ } },
    remove: (k) => { try { window.localStorage.removeItem(k); } catch { /* blocked */ } },
  };
}

function readJson<T>(st: Store, key: string, fallback: T): T {
  const raw = st.get(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// ------------------------------------------------------------ device switch
export const isOfflineEnabled = (st: Store) => st.get(K.enabled) === "1";
export const setOfflineEnabled = (st: Store, on: boolean) => (on ? st.set(K.enabled, "1") : st.remove(K.enabled));

/** Short id for this device, used inside temporary numbers. */
export function deviceId(st: Store, random: () => string = () => crypto.randomUUID()): string {
  let id = st.get(K.device);
  if (!id || !/^[A-Z0-9]{4}$/.test(id)) {
    id = random().replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase().padEnd(4, "0");
    st.set(K.device, id);
  }
  return id;
}

/** Temporary number for an offline sale: OFF-<branch>-<device>-<seq>, e.g. OFF-BR01-7K2Q-0003. */
export function makeTempNo(branchCode: string, device: string, seq: number): string {
  return `OFF-${branchCode}-${device}-${String(seq).padStart(4, "0")}`;
}

export function nextTempNo(st: Store, branchCode: string): string {
  const seq = Number(st.get(K.seq) || "0") + 1;
  st.set(K.seq, String(seq));
  return makeTempNo(branchCode, deviceId(st), seq);
}

// ------------------------------------------------------------ device screen
/** Which Cashier screen this device opens on (and keeps offline): the cashier till or the desk. */
export type DeviceScreen = "sell" | "desk" | "collect";
export function getDeviceScreen(st: Store): DeviceScreen | null {
  const v = st.get(K.screen);
  return v === "sell" || v === "desk" || v === "collect" ? v : null;
}
export const setDeviceScreen = (st: Store, v: DeviceScreen | null) => (v ? st.set(K.screen, v) : st.remove(K.screen));

// ------------------------------------------------------------ price list
export const loadCatalog = (st: Store) => readJson<Catalog | null>(st, K.catalog, null);
export const saveCatalog = (st: Store, c: Catalog) => st.set(K.catalog, JSON.stringify(c));

/** Same rules as the online search: exact barcode / extra code first, then name or SKU contains. */
export function searchCatalog(items: CatalogItem[], term: string, limit = 20): { item: CatalogItem; exact: boolean }[] {
  const q = term.trim();
  if (!q) return [];
  const exact = items.find((i) => i.s === q || i.c.includes(q));
  if (exact) return [{ item: exact, exact: true }];
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = items.filter((i) => {
    const hay = `${i.n} ${i.o} ${i.s ?? ""} ${i.c.join(" ")}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  return hits.slice(0, limit).map((item) => ({ item, exact: false }));
}

// ------------------------------------------------------------ queue
export const loadQueue = (st: Store) => readJson<QueuedSale[]>(st, K.queue, []);
const saveQueue = (st: Store, q: QueuedSale[]) => (q.length ? st.set(K.queue, JSON.stringify(q)) : st.remove(K.queue));
export const loadSent = (st: Store) => readJson<SentSale[]>(st, K.sent, []);

export function enqueue(st: Store, sale: QueuedSale) {
  const q = loadQueue(st);
  if (!q.some((x) => x.clientId === sale.clientId)) saveQueue(st, [...q, sale]);
}

/** Pending sales for one shift (closing a shift waits until these are sent). */
export const pendingForShift = (st: Store, shiftId: string) => loadQueue(st).filter((x) => x.shiftId === shiftId);

export type SendResult = { ok: true; invoiceId: string; number: string } | { ok: false; error: string; network?: boolean };

/**
 * Sends waiting sales in the order they happened. Stops at the first network
 * failure (still offline). A sale the server refuses stays in the queue with its
 * error so a manager can see it; the others carry on. `only` limits the run to
 * some sales (the till sends only the logged-in cashier's own shift).
 */
export async function flushQueue(
  st: Store,
  send: (s: QueuedSale) => Promise<SendResult>,
  now: () => string = () => new Date().toISOString(),
  only: (s: QueuedSale) => boolean = () => true,
) {
  let sent = 0, refused = 0, offline = false;
  for (const sale of loadQueue(st).filter(only)) {
    let r: SendResult;
    try { r = await send(sale); } catch { r = { ok: false, error: "network", network: true }; }
    if (!r.ok && r.network) { offline = true; break; }
    const q = loadQueue(st);
    if (r.ok) {
      saveQueue(st, q.filter((x) => x.clientId !== sale.clientId));
      st.set(K.sent, JSON.stringify([{ tempNo: sale.tempNo, number: r.number, invoiceId: r.invoiceId, sentAt: now() }, ...loadSent(st)].slice(0, 50)));
      sent++;
    } else {
      saveQueue(st, q.map((x) => (x.clientId === sale.clientId ? { ...x, error: r.error } : x)));
      refused++;
    }
  }
  return { sent, refused, offline, waiting: loadQueue(st).length };
}

/** A thrown server-action call (no connection, server unreachable) vs. a real answer. */
export const looksOffline = (e: unknown) =>
  (typeof navigator !== "undefined" && navigator.onLine === false) ||
  /fetch|network|load failed|connection/i.test(String((e as Error)?.message ?? e));
