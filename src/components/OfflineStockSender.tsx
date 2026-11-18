"use client";

import { useEffect } from "react";
import { postStockDocAction } from "@/app/actions/stock";
import { browserStore, looksOffline } from "@/lib/offline";
import { flushStockQueue, loadStockQueue } from "@/lib/offline-stock";

export const STOCK_QUEUE_EVENT = "stock-queue-changed";

/**
 * Runs on every page: sends stock documents saved without internet as soon as the
 * connection is back (on load, when the browser comes online, and every minute).
 */
export function OfflineStockSender() {
  useEffect(() => {
    let busy = false;
    const run = async () => {
      if (busy || !loadStockQueue(browserStore()).some((d) => !d.error)) return;
      busy = true;
      try {
        const r = await flushStockQueue(browserStore(), async (d) => {
          try {
            const res = await postStockDocAction(d.input);
            return res.ok ? { ok: true, docNo: res.docNo } : { ok: false, error: res.error };
          } catch (e) { return { ok: false, error: "network", network: looksOffline(e) || true }; }
        });
        if (r.sent || r.refused) window.dispatchEvent(new CustomEvent(STOCK_QUEUE_EVENT, { detail: r }));
      } finally { busy = false; }
    };
    const first = window.setTimeout(() => void run(), 1500);
    const every = window.setInterval(() => void run(), 60_000);
    const online = () => void run();
    window.addEventListener("online", online);
    window.addEventListener(STOCK_QUEUE_EVENT + ":try", online);
    return () => { window.clearTimeout(first); window.clearInterval(every); window.removeEventListener("online", online); window.removeEventListener(STOCK_QUEUE_EVENT + ":try", online); };
  }, []);
  return null;
}
