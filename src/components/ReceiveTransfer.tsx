"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict } from "@/i18n";
import { receiveTransferAction } from "@/app/actions/stock";

type L = { lineNo: number; name: string; options: string; sku: string | null; qty: string; price: string };

/** Receive an in-transit transfer: tick "arrived" per line, or type what actually came. */
export function ReceiveTransfer({ t, docId, lines }: { t: Dict; docId: string; lines: L[] }) {
  const F = t.stock.flow;
  const router = useRouter();
  const [got, setGot] = useState<Record<number, string>>(() => Object.fromEntries(lines.map((l) => [l.lineNo, l.qty])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <section className="card space-y-4" data-testid="receive">
      <h2 className="card-title">{F.receive}</h2>
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>{t.stock.item}</th><th>SKU</th><th>{F.price}</th><th>{F.sent}</th><th>{F.arrived}</th><th>{F.receivedQty}</th><th>{F.shortage} / {F.extra}</th></tr></thead>
          <tbody>
            {lines.map((l) => {
              const v = got[l.lineNo] ?? "0";
              const diff = Number(v || 0) - Number(l.qty);
              return (
                <tr key={l.lineNo}>
                  <td className="cell-title">{l.name}{l.options && <div className="text-xs text-gray-500">{l.options}</div>}</td>
                  <td data-label="SKU" className="font-mono text-xs" dir="ltr">{l.sku ?? "—"}</td>
                  <td data-label={F.price} dir="ltr">{Number(l.price).toFixed(2)}</td>
                  <td data-label={F.sent}>{l.qty}</td>
                  <td data-label={F.arrived}><input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={Number(v) === Number(l.qty)} onChange={(e) => setGot((g) => ({ ...g, [l.lineNo]: e.target.checked ? l.qty : "0" }))} /></td>
                  <td data-label={F.receivedQty}><input className="input w-24" dir="ltr" inputMode="decimal" value={v} onChange={(e) => setGot((g) => ({ ...g, [l.lineNo]: e.target.value }))} /></td>
                  <td data-label={F.shortage} className={diff < 0 ? "text-red-600" : diff > 0 ? "text-amber-700" : "text-gray-400"}>{diff === 0 ? "—" : diff < 0 ? `${F.shortage} ${-diff}` : `${F.extra} ${diff}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {msg && <p className={msg.ok ? "alert-ok" : "alert-err"}>{msg.text}</p>}
      <div className="flex justify-end">
        <button className="btn-primary" disabled={busy} onClick={async () => {
          setBusy(true); setMsg(null);
          const r = await receiveTransferAction(docId, lines.map((l) => ({ lineNo: l.lineNo, receivedQty: got[l.lineNo] ?? "0" })));
          setBusy(false);
          if (r.ok) { setMsg({ ok: true, text: `${F.receivedDone} ${F.shortage}: ${r.shortage} · ${F.extra}: ${r.extra}` }); router.refresh(); }
          else setMsg({ ok: false, text: (t.stock.errors as Record<string, string>)[r.error] ?? r.error });
        }}>{F.receive}</button>
      </div>
    </section>
  );
}
