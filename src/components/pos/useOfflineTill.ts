"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n";
import type { VariantHit } from "@/app/actions/stock";
import { postSaleAction, posCatalogAction } from "@/app/actions/pos";
import {
  browserStore, enqueue, flushQueue, getDeviceScreen, isOfflineEnabled, setDeviceScreen, type DeviceScreen, loadCatalog, loadQueue, loadSent, nextTempNo, saveCatalog,
  searchCatalog, setOfflineEnabled, type QueuedSale, type SentSale,
} from "@/lib/offline";

const CATALOG_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export type OfflineTill = ReturnType<typeof useOfflineTill>;

/** State and actions of the offline till for one open shift on this device. */
export function useOfflineTill(opts: { locale: Locale; branchCode: string; shiftId: string }) {
  const { locale, branchCode, shiftId } = opts;
  const [enabled, setEnabledState] = useState(false);
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<QueuedSale[]>([]);
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
    setSent(loadSent(st));
    setCatalogInfo(c ? { savedAt: c.savedAt, count: c.items.length } : null);
    setScreenState(getDeviceScreen(st));
    setLoaded(true);
  }, []);

  const refreshCatalog = useCallback(async () => {
    setBusy("catalog");
    try {
      const r = await posCatalogAction(locale);
      if (r.ok) saveCatalog(browserStore(), { savedAt: new Date().toISOString(), locale, items: r.items });
    } catch { /* offline: keep the old copy */ }
    setBusy("");
    reload();
  }, [locale, reload]);

  const flush = useCallback(async () => {
    if (flushing.current || !loadQueue(browserStore()).some((x) => x.shiftId === shiftId)) return;
    flushing.current = true;
    setBusy("send");
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

  // First load + connection events + a retry every 30 s while sales are waiting.
  useEffect(() => {
    const st = browserStore();
    const sync = () => {
      setOnline(navigator.onLine);
      reload();
      if (navigator.onLine) void flush();
    };
    // Read this device's storage after the first paint (the server can't see it).
    const first = window.setTimeout(() => {
      sync();
      if (navigator.onLine && isOfflineEnabled(st)) {
        const c = loadCatalog(st);
        if (!c || c.locale !== locale || Date.now() - Date.parse(c.savedAt) > CATALOG_MAX_AGE_MS) void refreshCatalog();
      }
    }, 0);
    const timer = window.setInterval(() => { if (navigator.onLine && loadQueue(browserStore()).length) void flush(); }, 30_000);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => { window.clearTimeout(first); window.clearInterval(timer); window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, [flush, refreshCatalog, reload, locale]);

  return {
    enabled, online, queue, sent, catalogInfo, busy, flush, refreshCatalog, screen, loaded,
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
    pendingFor: (shiftId: string) => queue.filter((x) => x.shiftId === shiftId).length,
  };
}
