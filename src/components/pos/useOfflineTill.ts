"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n";
import type { VariantHit } from "@/app/actions/stock";
import { cashMovementAction, postSaleAction, posCatalogAction, posCatalogStampAction, posCustomersAction, saveQuotationAction, type PosCustomer } from "@/app/actions/pos";
import {
  browserStore, enqueue, enqueueOp, flushOps, flushQueue, getDeviceScreen, isOfflineEnabled, setDeviceScreen, type DeviceScreen, loadCatalog, loadCustomers, loadOps, loadQueue, loadSent, nextConn,
  nextQuoteTempNo, nextTempNo, PING_EVERY_MS, saveCatalog, saveCustomers, searchCatalog, searchCustomersLocal, setOfflineEnabled, type ConnState, type QueuedOp, type QueuedSale, type SentSale,
} from "@/lib/offline";
import { normalizeSaudiMobile } from "@/lib/saudi";

const REFRESH_EVERY_MS = 60_000;        // price list: checked every minute, downloaded only when it changed
const CUSTOMERS_EVERY_MS = 5 * 60_000;

/** Pings the server: true = reachable. */
async function ping(): Promise<boolean> {
  try {
    const r = await fetch("/api/ping", { cache: "no-store", signal: AbortSignal.timeout(4_000) });
    return r.ok;
  } catch { return false; }
}

export type OfflineTill = ReturnType<typeof useOfflineTill>;

/** State and actions of the offline till for one open shift on this device. */
export function useOfflineTill(opts: { locale: Locale; branchCode: string; shiftId: string }) {
  const { locale, branchCode, shiftId } = opts;
  const [enabled, setEnabledState] = useState(false);
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<QueuedSale[]>([]);
  const [ops, setOps] = useState<QueuedOp[]>([]);
  const [offlineSince, setOfflineSince] = useState<number | null>(null);
  const conn = useRef<ConnState>({ online: true, fails: 0, since: 0 });
  const stamp = useRef<string>("");
  const customersAt = useRef(0);
  const [sent, setSent] = useState<SentSale[]>([]);
  const [catalogInfo, setCatalogInfo] = useState<{ savedAt: string; count: number } | null>(null);
  const [busy, setBusy] = useState<"" | "catalog" | "send">("");
  const [screen, setScreenState] = useState<DeviceScreen | null>(null);
  const [loaded, setLoaded] = useState(false);
  const flushing = useRef(false);

  const reload = useCallback(() => {
    const st = browserStore();
    const c = loadCatalog(st);
    setEnabledState(isOfflineEnabled(st));
    setQueue(loadQueue(st));
    setOps(loadOps(st));
    setSent(loadSent(st));
    setCatalogInfo(c ? { savedAt: c.savedAt, count: c.items.length } : null);
    setScreenState(getDeviceScreen(st));
    setLoaded(true);
  }, []);

  const refreshCustomers = useCallback(async () => {
    try {
      const r = await posCustomersAction();
      if (r.ok) { saveCustomers(browserStore(), r.items); customersAt.current = Date.now(); }
    } catch { /* offline: keep the old copy */ }
  }, []);

  const refreshCatalog = useCallback(async (quiet = false) => {
    if (!quiet) setBusy("catalog");
    try {
      const r = await posCatalogAction(locale);
      if (r.ok) saveCatalog(browserStore(), { savedAt: new Date().toISOString(), locale, items: r.items });
      const st = await posCatalogStampAction();
      if (st.ok) stamp.current = st.stamp;
    } catch { /* offline: keep the old copy */ }
    if (!quiet) setBusy("");
    void refreshCustomers();
    reload();
  }, [locale, reload, refreshCustomers]);

  /** Every minute while online: download the price list again only if something changed. */
  const checkCatalog = useCallback(async () => {
    const st = browserStore();
    if (!isOfflineEnabled(st) || !conn.current.online || document.visibilityState === "hidden") return;
    const c = loadCatalog(st);
    try {
      const r = await posCatalogStampAction();
      if (r.ok && (!c || c.locale !== locale || r.stamp !== stamp.current)) await refreshCatalog(true);
      else if (Date.now() - customersAt.current > CUSTOMERS_EVERY_MS) await refreshCustomers();
    } catch { /* offline */ }
  }, [locale, refreshCatalog, refreshCustomers]);

  const flush = useCallback(async () => {
    const st0 = browserStore();
    if (flushing.current || (!loadQueue(st0).some((x) => x.shiftId === shiftId) && !loadOps(st0).some((x) => x.shiftId === shiftId))) return;
    flushing.current = true;
    setBusy("send");
    // quotations first (a cashier may be waiting to collect them), then drawer entries
    await flushOps(browserStore(), async (op) => {
      const r = op.kind === "quote"
        ? await saveQuotationAction({ clientId: op.clientId, ...op.payload, offlineTempNo: op.tempNo })
        : await cashMovementAction({ clientId: op.clientId, shiftId: op.shiftId, ...op.payload });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    }, (op) => op.shiftId === shiftId && op.kind === "quote");
    await flushOps(browserStore(), async (op) => {
      if (op.kind !== "drawer") return { ok: true };
      const r = await cashMovementAction({ clientId: op.clientId, shiftId: op.shiftId, ...op.payload });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    }, (op) => op.shiftId === shiftId && op.kind === "drawer");
    await flushQueue(browserStore(), async (s) => {
      const r = await postSaleAction({
        clientId: s.clientId, locationId: s.locationId, shiftId: s.shiftId, ...s.payload,
        issuedAt: s.createdAt, offlineTempNo: s.tempNo,
      });
      return r.ok ? { ok: true, invoiceId: r.invoiceId, number: r.number } : { ok: false, error: r.error };
    }, undefined, (s) => s.shiftId === shiftId); // each cashier sends the sales of their own shift
    flushing.current = false;
    setBusy("");
    reload();
  }, [reload, shiftId]);

  // Connection: a ping every few seconds (two misses = offline, switch is automatic);
  // when it comes back, waiting work is sent. The price list is checked every minute.
  useEffect(() => {
    let stop = false;
    const apply = (ok: boolean) => {
      const was = conn.current.online;
      conn.current = nextConn(conn.current, ok, Date.now());
      setOnline(conn.current.online);
      setOfflineSince(conn.current.online ? null : conn.current.since);
      if (!was && conn.current.online) { reload(); void flush(); void checkCatalog(); }
    };
    const tick = async () => { if (!stop) apply(await ping()); };
    // Read this device's storage after the first paint (the server can't see it).
    const first = window.setTimeout(() => { reload(); void flush(); void checkCatalog(); void tick(); }, 0);
    const pinger = window.setInterval(() => void tick(), PING_EVERY_MS);
    const refresher = window.setInterval(() => {
      void checkCatalog();
      const st = browserStore();
      if (conn.current.online && (loadQueue(st).length || loadOps(st).length)) void flush();
    }, REFRESH_EVERY_MS);
    const goneOffline = () => { apply(false); apply(false); };
    const backOnline = () => void tick();
    window.addEventListener("offline", goneOffline);
    window.addEventListener("online", backOnline);
    return () => {
      stop = true;
      window.clearTimeout(first); window.clearInterval(pinger); window.clearInterval(refresher);
      window.removeEventListener("offline", goneOffline); window.removeEventListener("online", backOnline);
    };
  }, [flush, checkCatalog, reload]);

  return {
    enabled, online, offlineSince, queue, ops, sent, catalogInfo, busy, flush, refreshCatalog: () => refreshCatalog(false), screen, loaded,
    itemById: (id: string) => loadCatalog(browserStore())?.items.find((i) => i.v === id) ?? null,
    /** Search the customers copy kept on this device. */
    searchCustomersLocal(term: string): PosCustomer[] {
      const c = loadCustomers(browserStore());
      return searchCustomersLocal(c?.items ?? [], term, normalizeSaudiMobile).map((x) => ({ id: x.i, customerNo: x.no, name: x.n, phone: x.p, discountPct: x.d }));
    },
    /** A drawer entry made with no connection (only those that need no manager PIN). */
    saveDrawer(op: Omit<Extract<QueuedOp, { kind: "drawer" }>, "kind" | "createdAt" | "shiftId">) {
      enqueueOp(browserStore(), { ...op, kind: "drawer", shiftId, createdAt: new Date().toISOString() });
      reload();
    },
    /** A desk quotation made with no connection: gets a temporary number, sent later. */
    saveQuote(op: Omit<Extract<QueuedOp, { kind: "quote" }>, "kind" | "createdAt" | "shiftId" | "tempNo">) {
      const tempNo = nextQuoteTempNo(browserStore(), branchCode);
      enqueueOp(browserStore(), { ...op, kind: "quote", shiftId, tempNo, createdAt: new Date().toISOString() });
      reload();
      return tempNo;
    },
    setScreen(v: DeviceScreen | null) {
      setDeviceScreen(browserStore(), v);
      reload();
    },
    setEnabled(on: boolean) {
      setOfflineEnabled(browserStore(), on);
      reload();
      if (on) void refreshCatalog();
    },
    /** Search the copy of the price list kept on this device. */
    searchLocal(term: string): VariantHit[] {
      const c = loadCatalog(browserStore());
      return searchCatalog(c?.items ?? [], term).map(({ item, exact }) => ({
        variantId: item.v, name: item.n, options: item.o, sku: item.s, price: item.p, image: null, isService: item.x, exact,
      }));
    },
    save(sale: Omit<QueuedSale, "tempNo">): QueuedSale {
      const st = browserStore();
      const full = { ...sale, tempNo: nextTempNo(st, branchCode) };
      enqueue(st, full);
      reload();
      return full;
    },
    pendingFor: (shiftId: string) => queue.filter((x) => x.shiftId === shiftId).length + ops.filter((x) => x.shiftId === shiftId).length,
  };
}
