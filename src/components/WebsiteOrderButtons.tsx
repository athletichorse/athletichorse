"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict } from "@/i18n";
import { websiteOrderAction } from "@/app/actions/orders";
import type { WebsiteAction } from "@/lib/website-orders";

/** Change the order on the website: each button asks "Sure?" first, then shows what happened. */
export function WebsiteOrderButtons({ t, orderId, show, hasWaybill }: { t: Dict; orderId: string; show: Record<WebsiteAction, boolean>; hasWaybill: boolean }) {
  const W = t.orders.website;
  const router = useRouter();
  const [ask, setAsk] = useState<WebsiteAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const label: Record<WebsiteAction, string> = { ship: W.ship, paid: W.paid, cancel: W.cancel };
  const sure: Record<WebsiteAction, string> = { ship: W.shipSure, paid: W.paidSure, cancel: W.cancelSure };

  async function go(a: WebsiteAction) {
    setBusy(true);
    setMsg(null);
    const r = await websiteOrderAction(orderId, a).catch(() => ({ ok: false as const, error: "network" }));
    setBusy(false);
    setAsk(null);
    if (r.ok) {
      setMsg({ ok: true, text: W.done[a] });
      router.refresh();
    } else {
      const known = W.errors[r.error as keyof typeof W.errors];
      setMsg({ ok: false, text: known ?? `${W.errors.failed} ${r.error}` });
    }
  }

  const actions = (["ship", "paid", "cancel"] as const).filter((a) => show[a]);
  return (
    <section className="card no-print mb-4" data-testid="website-actions">
      <h2 className="card-title">{W.title}</h2>
      {!actions.length && <p className="text-sm text-gray-500">{W.nothing}</p>}
      {ask ? (
        <div className="flex flex-wrap items-center gap-2" role="alertdialog" aria-label={sure[ask]}>
          <span className="text-sm font-medium">{sure[ask]}</span>
          <button type="button" className={ask === "cancel" ? "btn-primary !bg-red-700" : "btn-primary"} disabled={busy} onClick={() => go(ask)} data-testid="website-yes">{busy ? W.working : W.yes}</button>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => setAsk(null)}>{W.no}</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <button key={a} type="button" className={a === "cancel" ? "btn-ghost text-red-700" : "btn-ghost"} disabled={a === "ship" && !hasWaybill} onClick={() => { setMsg(null); setAsk(a); }} data-testid={`website-${a}`}>
              {label[a]}
            </button>
          ))}
        </div>
      )}
      {show.ship && !hasWaybill && <p className="mt-2 text-xs text-gray-500">{W.needWaybill}</p>}
      {msg && <p role="status" className={`mt-2 text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
    </section>
  );
}
