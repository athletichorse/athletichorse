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
    customerPhone?: string;
    customerName?: string;
    lines: { variantId: string; qty: string; unitPrice: string; discount: string }[];
    payments: { method: string; amount: string }[];
    cashTendered?: string;
    quoteTempNo?: string; // collected from a desk slip made offline
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

// ------------------------------------------------------------ connection
/**
 * Real connection check (navigator.onLine only knows about the cable/Wi-Fi): the page pings
 * /api/ping every few seconds. Two failed pings in a row = offline; one good ping = online.
 */
export type ConnState = { online: boolean; fails: number; since: number };
export const PING_EVERY_MS = 5_000;
export const FAILS_TO_OFFLINE = 2;
export function nextConn(s: ConnState, pingOk: boolean, now: number): ConnState {
  if (pingOk) return s.online ? { ...s, fails: 0 } : { online: true, fails: 0, since: now };
  const fails = s.fails + 1;
  return s.online && fails >= FAILS_TO_OFFLINE ? { online: false, fails, since: now } : { ...s, fails };
}

// ------------------------------------------------------------ customers copy
/** i = id, no = customer no., n = name, p = +9665… mobile, d = usual discount % */
export type CustomerItem = { i: string; no: number; n: string; p: string; d: number; l?: string };
const KC = "pos-customers-v1";
export const loadCustomers = (st: Store) => readJson<{ savedAt: string; items: CustomerItem[] } | null>(st, KC, null);
export const saveCustomers = (st: Store, items: CustomerItem[], savedAt = new Date().toISOString()) => st.set(KC, JSON.stringify({ savedAt, items }));

/** Same rules as the online search: mobile, then customer no., then name contains. */
export function searchCustomersLocal(items: CustomerItem[], term: string, normalizePhone: (s: string) => string | null): CustomerItem[] {
  const t = term.trim();
  if (!t) return [];
  const phone = normalizePhone(t);
  if (phone) return items.filter((c) => c.p === phone).slice(0, 1);
  if (/^\d{1,9}$/.test(t)) { const hit = items.filter((c) => c.no === Number(t)); if (hit.length) return hit.slice(0, 1); }
  const q = t.toLowerCase();
  return items.filter((c) => c.n.toLowerCase().includes(q)).slice(0, 10);
}

// ------------------------------------------------------------ other offline work (drawer entries, desk quotations)
export type QueuedOp =
  | { kind: "drawer"; clientId: string; shiftId: string; createdAt: string; label: string; payload: { kind: "cash_out" | "cash_in" | "expense" | "customer_payment"; amount: string; reason: string; expenseTypeId?: string; customerId?: string; method?: string }; error?: string }
  | { kind: "quote"; clientId: string; shiftId: string; createdAt: string; label: string; tempNo: string; payload: { locationId: string; salespersonId?: string; customerId?: string; lines: { variantId: string; qty: string; unitPrice: string; discount: string }[] }; error?: string }
  | { kind: "return"; clientId: string; shiftId: string; createdAt: string; label: string; tempNo: string; total: string;
      payload: { locationId: string; originalInvoiceId?: string; customerId?: string; reason: string; refundMethod: string; lines: { lineNo?: number; variantId?: string; qty: string }[] };
      slip: { original: string | null; lines: { name: string; qty: string; amount: string }[] }; error?: string };
const KO = "pos-offline-ops-v1";
export const loadOps = (st: Store) => readJson<QueuedOp[]>(st, KO, []);
const saveOps = (st: Store, q: QueuedOp[]) => (q.length ? st.set(KO, JSON.stringify(q)) : st.remove(KO));
export function enqueueOp(st: Store, op: QueuedOp) {
  const q = loadOps(st);
  if (!q.some((x) => x.clientId === op.clientId)) saveOps(st, [...q, op]);
}
/** Same behaviour as flushQueue: in order, stop when still offline, keep refusals with their error. */
export async function flushOps(st: Store, send: (op: QueuedOp) => Promise<SendResult | { ok: true }>, only: (op: QueuedOp) => boolean = () => true) {
  let sent = 0, refused = 0, offline = false;
  for (const op of loadOps(st).filter(only)) {
    let r: SendResult | { ok: true };
    try { r = await send(op); } catch { r = { ok: false, error: "network", network: true }; }
    if (!r.ok && r.network) { offline = true; break; }
    const q = loadOps(st);
    if (r.ok) { saveOps(st, q.filter((x) => x.clientId !== op.clientId)); sent++; }
    else { saveOps(st, q.map((x) => (x.clientId === op.clientId ? { ...x, error: r.error } : x))); refused++; }
  }
  return { sent, refused, offline, waiting: loadOps(st).length };
}

/** Temporary quotation number: OFF-<branch>-<device>-Q0001 (own counter). */
export function nextQuoteTempNo(st: Store, branchCode: string): string {
  const seq = Number(st.get("pos-offline-qseq") || "0") + 1;
  st.set("pos-offline-qseq", String(seq));
  return `OFF-${branchCode}-${deviceId(st)}-Q${String(seq).padStart(4, "0")}`;
}

// ------------------------------------------------------------ quotation QR (desk slip → cashier, works offline)
/**
 * The desk slip's QR holds the quotation itself, so the cashier can scan it even with no
 * connection between the two devices: AHQ1|<number>|<variant>,<qty>,<price>,<discount>;…
 */
export type QrLine = { variantId: string; qty: string; unitPrice: string; discount: string };
export function encodeQuoteQr(no: string, lines: QrLine[]): string {
  return `AHQ1|${no}|${lines.map((l) => [l.variantId, l.qty, l.unitPrice, l.discount || "0"].join(",")).join(";")}`;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUM_RE = /^\d{1,9}(\.\d{1,3})?$/;
export function decodeQuoteQr(text: string): { no: string; lines: QrLine[] } | null {
  const m = /^AHQ1\|([A-Za-z0-9-]{1,40})\|(.+)$/.exec(text.trim());
  if (!m) return null;
  const lines: QrLine[] = [];
  for (const part of m[2].split(";")) {
    const [variantId, qty, unitPrice, discount] = part.split(",");
    if (!UUID_RE.test(variantId ?? "") || ![qty, unitPrice, discount].every((x) => NUM_RE.test(x ?? "")) || Number(qty) <= 0) return null;
    lines.push({ variantId, qty, unitPrice, discount });
  }
  return lines.length ? { no: m[1], lines } : null;
}

// ------------------------------------------------------------ returns without internet
/** Temporary return number: OFF-<branch>-<device>-R0001 (own counter). */
export function nextReturnTempNo(st: Store, branchCode: string): string {
  const seq = Number(st.get("pos-offline-rseq") || "0") + 1;
  st.set("pos-offline-rseq", String(seq));
  return `OFF-${branchCode}-${deviceId(st)}-R${String(seq).padStart(4, "0")}`;
}

/** A sent temporary number and the real one it became (shown in the offline bar). */
export function rememberSent(st: Store, x: SentSale) {
  st.set(K.sent, JSON.stringify([x, ...loadSent(st)].slice(0, 50)));
}

/** i = id, n = number, o = offline temp no., t = time, c = customer, l = [lineNo, name, sku, qty, returnable, gross] */
export type RecentInvoice = { i: string; n: string; o: string | null; t: string; c: string | null; l: [number, string, string | null, string, string, string][] };
const KI = "pos-invoices-v1";
export const loadInvoices = (st: Store) => readJson<{ savedAt: string; locationId: string; items: RecentInvoice[] } | null>(st, KI, null);
export const saveInvoices = (st: Store, locationId: string, items: RecentInvoice[], savedAt = new Date().toISOString()) => {
  // returns made here but not sent yet are still taken off what can be returned
  const pending = loadOps(st).filter((o): o is Extract<QueuedOp, { kind: "return" }> => o.kind === "return");
  st.set(KI, JSON.stringify({ savedAt, locationId, items: items.map((inv) => applyPendingReturns(inv, pending)) }));
};
function applyPendingReturns(inv: RecentInvoice, pending: Extract<QueuedOp, { kind: "return" }>[]): RecentInvoice {
  const mine = pending.filter((o) => o.payload.originalInvoiceId === inv.i);
  if (!mine.length) return inv;
  return { ...inv, l: inv.l.map((l) => {
    const q = mine.reduce((sum, o) => sum + o.payload.lines.filter((x) => x.lineNo === l[0]).reduce((a, x) => a + toMilli(x.qty), 0n), 0n);
    return q ? [l[0], l[1], l[2], l[3], fromMilli(toMilli(l[4]) - q > 0n ? toMilli(l[4]) - q : 0n), l[5]] : l;
  }) };
}
/** Find a receipt in the copy by its number or its temporary (offline) number. */
export function findInvoiceLocal(st: Store, number: string): RecentInvoice | null {
  const n = number.trim().toUpperCase();
  if (!n) return null;
  return loadInvoices(st)?.items.find((x) => x.n.toUpperCase() === n || (x.o ?? "").toUpperCase() === n) ?? null;
}
/** After an offline return: take the quantities off what can still be returned on this device. */
export function takeReturned(st: Store, invoiceId: string, lines: { lineNo: number; qty: string }[]) {
  const c = loadInvoices(st);
  if (!c) return;
  const items = c.items.map((inv) => (inv.i !== invoiceId ? inv : { ...inv, l: inv.l.map((l) => {
    const q = lines.filter((x) => x.lineNo === l[0]).reduce((a, x) => a + toMilli(x.qty), 0n);
    const left = toMilli(l[4]) - q;
    return q ? ([l[0], l[1], l[2], l[3], fromMilli(left > 0n ? left : 0n), l[5]] as RecentInvoice["l"][number]) : l;
  }) }));
  st.set(KI, JSON.stringify({ ...c, items }));
}

// exact decimal maths (no floats): quantities in thousandths, money in halalas
const toMilli = (q: string) => {
  const m = /^(\d+)(?:\.(\d{0,3}))?$/.exec(String(q).trim());
  return m ? BigInt(m[1]) * 1000n + BigInt((m[2] ?? "").padEnd(3, "0") || "0") : 0n;
};
const fromMilli = (m: bigint) => { const w = m / 1000n, f = m % 1000n; return f ? `${w}.${String(f).padStart(3, "0").replace(/0+$/, "")}` : String(w); };
const toHal = (a: string) => {
  const m = /^(-?)(\d+)(?:\.(\d{0,2}))?$/.exec(String(a).trim());
  if (!m) return 0n;
  const v = BigInt(m[2]) * 100n + BigInt((m[3] ?? "").padEnd(2, "0") || "0");
  return m[1] ? -v : v;
};
const fromHal = (h: bigint) => `${h < 0n ? "-" : ""}${(h < 0n ? -h : h) / 100n}.${String((h < 0n ? -h : h) % 100n).padStart(2, "0")}`;

/**
 * Refund for returning part of a receipt line: the line's total × returned / sold, rounded to
 * the halala the same way the server does. Returns null if the quantity is not allowed.
 */
export function returnLineAmount(line: RecentInvoice["l"][number], qty: string): string | null {
  const q = toMilli(qty), sold = toMilli(line[3]), left = toMilli(line[4]);
  if (q <= 0n || q > left || sold <= 0n) return null;
  return fromHal((toHal(line[5]) * q * 2n + sold) / (sold * 2n));
}
/** No receipt: shelf price × quantity, rounded to the halala. */
export function noReceiptAmount(price: string, qty: string): string | null {
  const q = toMilli(qty);
  if (q <= 0n) return null;
  return fromHal((toHal(price) * q * 2n + 1000n) / 2000n);
}
export const sumAmounts = (xs: string[]) => fromHal(xs.reduce((a, x) => a + toHal(x), 0n));

// ------------------------------------------------------------ price levels copy
/** Every price level with its prices (variant → price), for customers on a level when offline. */
export type LevelCopy = { id: string; name: string; prices: Record<string, string> };
const KL = "pos-levels-v1";
export const loadLevels = (st: Store) => readJson<{ savedAt: string; levels: LevelCopy[] } | null>(st, KL, null);
export const saveLevels = (st: Store, levels: LevelCopy[], savedAt = new Date().toISOString()) => st.set(KL, JSON.stringify({ savedAt, levels }));
/** The price an item has for a customer: their level's price if the item has one, else the normal price. */
export const priceFor = (base: string, variantId: string, level: LevelCopy | null | undefined) => level?.prices[variantId] ?? base;
