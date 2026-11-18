"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict, Locale } from "@/i18n";
import { createRequestAction, searchVariantsAction, type VariantHit } from "@/app/actions/stock";
import { ItemFinderButton } from "./ItemFinderButton";

type Loc = { id: string; name: string };
type Line = { variantId: string; name: string; options: string; sku: string | null; qty: string };

/** New restock request: scan items, say for which store and (optionally) from which store. */
export function RequestForm({ t, locale, mine, all }: { t: Dict; locale: Locale; mine: Loc[]; all: Loc[] }) {
  const F = t.stock.flow;
  const router = useRouter();
  const [to, setTo] = useState(mine[0]?.id ?? "");
  const [from, setFrom] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<VariantHit[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const clientId = useRef(crypto.randomUUID());
  const add = (h: VariantHit, qty?: string) => {
    if (h.isService) return;
    const n = qty && Number(qty) > 0 ? Number(qty) : 1;
    setLines((ls) => ls.some((l) => l.variantId === h.variantId) ? ls.map((l) => (l.variantId === h.variantId ? { ...l, qty: String(Number(l.qty) + n) } : l)) : [...ls, { variantId: h.variantId, name: h.name, options: h.options, sku: h.sku, qty: String(n) }]);
    setTerm(""); setHits(null);
  };
  return (
    <section className="card space-y-3">
      <h2 className="card-title">{F.newRequest}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label">{F.forStore}</label><select className="input" value={to} onChange={(e) => setTo(e.target.value)}>{mine.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        <div><label className="label">{F.fromStore}</label><select className="input" value={from} onChange={(e) => setFrom(e.target.value)}><option value="">{F.anyStore}</option>{all.filter((l) => l.id !== to).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        <div><label className="label">{t.stock.note}</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></div>
      </div>
      <div className="relative flex flex-wrap gap-2">
        <input className="input min-w-0 flex-1" placeholder={t.stock.scanOrSearch} value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={async (e) => {
          if (e.key !== "Enter") return; e.preventDefault();
          const r = await searchVariantsAction(term, locale);
          if (r.length === 1 || r[0]?.exact) add(r[0]); else setHits(r);
        }} />
        {/* stock shown for the store the items come from (or the store asking) */}
        <ItemFinderButton t={t} locale={locale} locationId={from || to || null} onPick={(h, q) => add(h, q)} />
        {hits && (
          <div className="absolute top-full z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-[var(--line)] bg-white shadow-lg">
            {hits.length === 0 && <div className="px-4 py-3 text-sm text-gray-500">{t.stock.notFound}</div>}
            {hits.map((h) => <button key={h.variantId} type="button" onClick={() => add(h)} className="flex w-full justify-between gap-3 px-4 py-2.5 text-start text-sm hover:bg-gray-50"><span>{h.name}{h.options && <span className="text-gray-500"> · {h.options}</span>}</span><span className="font-mono text-xs text-gray-500" dir="ltr">{h.sku ?? ""}</span></button>)}
          </div>
        )}
      </div>
      {lines.length > 0 && (
        <table className="table">
          <thead><tr><th>{t.stock.item}</th><th>SKU</th><th>{t.stock.qty}</th><th></th></tr></thead>
          <tbody>{lines.map((l, i) => (
            <tr key={l.variantId}>
              <td className="cell-title">{l.name}{l.options && <div className="text-xs text-gray-500">{l.options}</div>}</td>
              <td data-label="SKU" className="font-mono text-xs" dir="ltr">{l.sku ?? "—"}</td>
              <td data-label={t.stock.qty}><input className="input w-24" dir="ltr" inputMode="decimal" value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} /></td>
              <td><button type="button" className="text-sm text-red-600 hover:underline" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>{t.stock.remove}</button></td>
            </tr>
          ))}</tbody>
        </table>
      )}
      {msg && <p className={msg.ok ? "alert-ok" : "alert-err"}>{msg.text}</p>}
      <div className="flex justify-end">
        <button className="btn-primary" disabled={busy || !lines.length || !to} onClick={async () => {
          setBusy(true); setMsg(null);
          const r = await createRequestAction({ clientId: clientId.current, toLocationId: to, fromLocationId: from || null, note, lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })) });
          setBusy(false);
          if (r.ok) { setMsg({ ok: true, text: `${F.requestSent} ${r.requestNo}` }); setLines([]); setNote(""); clientId.current = crypto.randomUUID(); router.refresh(); }
          else setMsg({ ok: false, text: (t.stock.errors as Record<string, string>)[r.error] ?? r.error });
        }}>{F.sendRequests}</button>
      </div>
    </section>
  );
}
