"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n";
import type { VariantHit } from "@/app/actions/stock";
import { cashMovementAction, postReturnAction, postSaleAction, posCatalogAction, posCatalogStampAction, posCustomersAction, posRecentInvoicesAction, saveQuotationAction, type PosCustomer } from "@/app/actions/pos";
import {
  browserStore, enqueue, enqueueOp, flushOps, flushQueue, getDeviceScreen, isOfflineEnabled, setDeviceScreen, type DeviceScreen, loadCatalog, loadCustomers, loadOps, loadQueue, loadSent, nextConn,
  nextQuoteTempNo, nextReturnTempNo, nextTempNo, rememberSent, saveInvoices, findInvoiceLocal, takeReturned, loadInvoices, type RecentInvoice, PING_EVERY_MS, saveCatalog, saveCustomers, searchCatalog, searchCustomersLocal, setOfflineEnabled, type ConnState, type QueuedOp, type QueuedSale, type SentSale,
} from "@/lib/offline";
import { normalizeSaudiMobile } from "@/lib/saudi";

const REFRESH_EVERY_MS = 60_000;        // price list: checked every minute, downloaded only when it changed
const CUSTOMERS_EVERY_MS = 5 * 60_000;
const INVOICES_EVERY_MS = 2 * 60_000;   // receipts copy (for returns without internet)

/** Pings the server: true = reachable. */
async function ping(): Promise<boolean> {
  try {
    const r = await fetch("/api/ping", { cache: "no-store", signal: AbortSignal.timeout(4_000) });
    return r.ok;
  } catch { return false; }
}

export type OfflineTill = ReturnType<typeof useOfflineTill>;

/** State and actions of the offline till for one open shift on this device. */
export function useOfflineTill(opts: { locale: Locale; branchCode: string; shiftId: string; locationId: string; canReturn: boolean }) {
  const { locale, branchCode, shiftId, locationId, canReturn } = opts;
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

  const [invoicesInfo, setInvoicesInfo] = useState<{ savedAt: string; count: number } | null>(null);
  const invoicesAt = useRef(0);
  /** Recent receipts of this branch, so returns work without internet too. */
  const refreshInvoices = useCallback(async () => {
    if (canReturn) {
      try {
        const ri = await posRecentInvoicesAction(locationId);
        if (ri.ok) { saveInvoices(browserStore(), locationId, ri.items); invoicesAt.current = Date.now(); }
      } catch { /* offline: keep the old copy */ }
    }
    const c = loadInvoices(browserStore());
    setInvoicesInfo(c && c.locationId === locationId ? { savedAt: c.savedAt, count: c.items.length } : null);
  }, [canReturn, locationId]);
  const refreshCustomers = useCallback(async () => {
    try {
      const r = await posCustomersAction();
      if (r.ok) { saveCustomers(browserStore(), r.items); customersAt.current = Date.now(); }
    } catch { /* offline: keep the old copy */ }
    await refreshInvoices();
  }, [refreshInvoices]);

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
      else if (Date.now() - invoicesAt.current > INVOICES_EVERY_MS) await refreshInvoices();
    } catch { /* offline */ }
  }, [locale, refreshCatalog, refreshCustomers, refreshInvoices]);

  const flush = useCallback(async () => {
    const st0 = browserStore();
    if (flushing.current || (!loadQueue(st0).some((x) => x.shiftId === shiftId) && !loadOps(st0).some((x) => x.shiftId === shiftId))) return;
    flushing.current = true;
    setBusy("send");
    // quotations first (a cashier may be waiting to collect them), then drawer entries
    await flushOps(browserStore(), async (op) => {
      if (op.kind !== "quote") return { ok: true };
      const r = await saveQuotationAction({ clientId: op.clientId, ...op.payload, offlineTempNo: op.tempNo });
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
    // returns last (they may give back items sold above)
    await flushOps(browserStore(), async (op) => {
      if (op.kind !== "return") return { ok: true };
      const r = await postReturnAction({ clientId: op.clientId, shiftId: op.shiftId, ...op.payload, issuedAt: op.createdAt, offlineTempNo: op.tempNo });
      if (!r.ok) return { ok: false, error: r.error };
      rememberSent(browserStore(), { tempNo: op.tempNo, number: r.number, invoiceId: r.invoiceId, sentAt: new Date().toISOString() });
      return { ok: true };
    }, (op) => op.shiftId === shiftId && op.kind === "return");
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
    invoicesInfo,
    /** Find a receipt in the copy kept on this device (number or temporary number). */
    findInvoiceLocal: (number: string): RecentInvoice | null => {
      const st = browserStore();
      return loadInvoices(st)?.locationId === locationId ? findInvoiceLocal(st, number) : null;
    },
    /** A return made with no connection: gets a temporary number, sent later with the same client id. */
    saveReturn(op: Omit<Extract<QueuedOp, { kind: "return" }>, "kind" | "createdAt" | "shiftId" | "tempNo">) {
      const st = browserStore();
      const tempNo = nextReturnTempNo(st, branchCode);
      const full = { ...op, kind: "return" as const, shiftId, tempNo, createdAt: new Date().toISOString() };
      enqueueOp(st, full);
      if (op.payload.originalInvoiceId) takeReturned(st, op.payload.originalInvoiceId, op.payload.lines.filter((l) => l.lineNo !== undefined).map((l) => ({ lineNo: l.lineNo!, qty: l.qty })));
      reload();
      return full;
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
    /** The whole price list kept on this device (search by columns without internet). */
    searchAll(): VariantHit[] {
      const c = loadCatalog(browserStore());
      return (c?.items ?? []).map((item) => ({ variantId: item.v, name: item.n, options: item.o, sku: item.s, price: item.p, image: null, isService: item.x, exact: false }));
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
