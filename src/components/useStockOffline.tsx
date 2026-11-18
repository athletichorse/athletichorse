"use client";

import { useCallback, useEffect, useState } from "react";
import type { Dict, Locale } from "@/i18n";
import { posCatalogAction } from "@/app/actions/pos";
import type { VariantHit } from "@/app/actions/stock";
import { browserStore, loadCatalog, saveCatalog, searchCatalog } from "@/lib/offline";
import { dropStockDoc, enqueueStockDoc, loadStockQueue, type QueuedStockDoc } from "@/lib/offline-stock";
import { STOCK_QUEUE_EVENT } from "./OfflineStockSender";

const COPY_MAX_AGE_MS = 6 * 3600_000;

/** Stock screens without internet: the item list kept on the device + documents waiting to be sent. */
export function useStockOffline(locale: Locale) {
  const [queue, setQueue] = useState<QueuedStockDoc[]>([]);
  const reload = useCallback(() => setQueue(loadStockQueue(browserStore())), []);

  useEffect(() => {
    const first = window.setTimeout(reload, 0);
    // keep a fresh copy of the item list while online (used when the internet drops)
    const c = loadCatalog(browserStore());
    if (!c || c.locale !== locale || Date.now() - Date.parse(c.savedAt) > COPY_MAX_AGE_MS) {
      posCatalogAction(locale).then((r) => { if (r.ok) saveCatalog(browserStore(), { savedAt: new Date().toISOString(), locale, items: r.items }); }).catch(() => {});
    }
    const changed = () => reload();
    window.addEventListener(STOCK_QUEUE_EVENT, changed);
    return () => { window.clearTimeout(first); window.removeEventListener(STOCK_QUEUE_EVENT, changed); };
  }, [locale, reload]);

  return {
    queue,
    hasCopy: () => !!loadCatalog(browserStore())?.items.length,
    searchLocal(term: string): VariantHit[] {
      return searchCatalog(loadCatalog(browserStore())?.items ?? [], term).map(({ item, exact }) => ({
        variantId: item.v, name: item.n, options: item.o, sku: item.s, price: item.p, image: null, isService: item.x, exact,
      }));
    },
    save(d: Omit<QueuedStockDoc, "createdAt">) {
      enqueueStockDoc(browserStore(), { ...d, createdAt: new Date().toISOString() });
      reload();
    },
    drop(clientId: string) { dropStockDoc(browserStore(), clientId); reload(); },
    sendNow() { window.dispatchEvent(new Event(STOCK_QUEUE_EVENT + ":try")); },
  };
}

/** Documents saved on this device: waiting, or refused by the server (with the reason). */
export function StockQueueList({ t, off, err }: { t: Dict; off: ReturnType<typeof useStockOffline>; err: (code: string) => string }) {
  const O = t.stock.offline;
  if (!off.queue.length) return null;
  return (
    <section className="card space-y-2 border-amber-300 bg-amber-50" data-testid="stock-queue">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-amber-900">{O.waiting}: {off.queue.filter((d) => !d.error).length}</span>
        <div className="flex-1" />
        <button type="button" className="btn-ghost" onClick={off.sendNow}>{O.sendNow}</button>
      </div>
      <ul className="space-y-1 text-sm">
        {off.queue.map((d) => (
          <li key={d.clientId} className="flex flex-wrap items-center gap-2">
            <span>{d.label}</span>
            {d.error && <span className="text-red-700">· {O.refused}: {err(d.error)}</span>}
            {d.error && <button type="button" className="text-red-700 underline" onClick={() => off.drop(d.clientId)}>{O.drop}</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
