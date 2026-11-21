"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict } from "@/i18n";
import { receivePurchaseAction } from "@/app/actions/purchasing";

export type ReceiveLine = { lineNo: number; name: string; sku: string | null; left: number };

/** Goods arrived: what came now, line by line (filled with what's left), and the supplier's invoice no. */
export function ReceivePurchase({ t, orderId, lines }: { t: Dict; orderId: string; lines: ReceiveLine[] }) {
  const P = t.purchasing;
  const router = useRouter();
  const [qty, setQty] = useState<Record<number, string>>(Object.fromEntries(lines.map((l) => [l.lineNo, String(l.left)])));
  const [billNo, setBillNo] = useState("");
  const [on, setOn] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const clientId = useRef(crypto.randomUUID());

  async function go() {
    setBusy(true); setMsg(null);
    const r = await receivePurchaseAction({ clientId: clientId.current, orderId, billNo, receivedOn: on, lines: lines.map((l) => ({ lineNo: l.lineNo, qty: qty[l.lineNo] ?? "" })) })
      .catch(() => ({ ok: false as const, error: "network" }));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: (P.errors as Record<string, string>)[r.error] ?? r.error });
    clientId.current = crypto.randomUUID();
    setMsg({ ok: true, text: `${t.saved} · ${P.stockDoc} ${r.docNo}` });
    router.refresh();
  }

  return (
    <section className="card" data-testid="receive">
      <h2 className="card-title">{P.receive}</h2>
      <p className="mb-3 text-sm text-gray-500">{P.receiveHint}</p>
      {msg && <p className={msg.ok ? "alert-ok mb-3" : "alert-err mb-3"} role="status">{msg.text}</p>}
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="rc-bill">{P.billNo}</label><input id="rc-bill" className="input" dir="ltr" value={billNo} maxLength={60} onChange={(e) => setBillNo(e.target.value)} /></div>
        <div><label className="label" htmlFor="rc-on">{P.receivedOn}</label><input id="rc-on" type="date" className="input" value={on} onChange={(e) => setOn(e.target.value)} /></div>
      </div>
      <div className="overflow-x-auto"><table className="table table-compact">
        <thead><tr><th>{P.item}</th><th>{P.remaining}</th><th>{P.qty}</th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.lineNo}>
              <td className="cell-title">{l.name}<div className="font-mono text-xs text-gray-400" dir="ltr">{l.sku ?? ""}</div></td>
              <td data-label={P.remaining} dir="ltr">{l.left}</td>
              <td data-label={P.qty}><input className="input w-24" dir="ltr" inputMode="decimal" aria-label={`${P.qty} ${l.sku ?? l.name}`} value={qty[l.lineNo] ?? ""} onChange={(e) => setQty({ ...qty, [l.lineNo]: e.target.value })} /></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <div className="mt-3 flex justify-end"><button type="button" className="btn-primary" disabled={busy} onClick={go} data-testid="receive-now">{busy ? P.saving : P.receiveNow}</button></div>
    </section>
  );
}
