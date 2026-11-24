"use client";

import { useRef, useState } from "react";
import type { Dict, Locale } from "@/i18n";
import { searchVariantsAction, type VariantHit } from "@/app/actions/stock";
import { ItemFinderButton } from "./ItemFinderButton";

export type EditLine = { variantId: string; name: string; options: string; sku: string | null; qty: string; price: string; discount: string; listPrice: string };

/**
 * Item lines for purchase orders (qty × unit cost) and B2B orders (qty × price, discount %).
 * Scan / type a code or name, or use the item finder; quantities and prices are typed in the table.
 */
export function LinesEditor({ t, locale, mode, lines, setLines, locationId, priceFor, labels, extra }: {
  t: Dict; locale: Locale; mode: "po" | "b2b"; lines: EditLine[]; setLines: (f: (l: EditLine[]) => EditLine[]) => void;
  locationId: string | null; priceFor?: (h: VariantHit) => string;
  /** small note under an item's name (e.g. cartons and CBM) */
  extra?: (l: EditLine) => React.ReactNode;
  labels: { item: string; qty: string; price: string; discount?: string; lineTotal: string };
}) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<VariantHit[] | null>(null);
  const [msg, setMsg] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  function add(h: VariantHit, qty?: string) {
    if (mode === "po" && h.isService) return setMsg(t.stock.service);
    const n = qty && Number(qty) > 0 ? qty : "1";
    setLines((ls) => {
      const i = ls.findIndex((l) => l.variantId === h.variantId);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: String(Number(l.qty || 0) + Number(n)) } : l));
      return [...ls, { variantId: h.variantId, name: h.name, options: h.options, sku: h.sku, qty: n, price: mode === "po" ? "" : priceFor?.(h) ?? h.price, discount: "", listPrice: h.price }];
    });
    setTerm(""); setHits(null); setMsg("");
    ref.current?.focus();
  }
  async function search(enter: boolean) {
    const q = term.trim();
    if (!q) return;
    const r = await searchVariantsAction(q, locale);
    if (enter && (r.length === 1 || r[0]?.exact)) return add(r[0]);
    setHits(r);
  }
  const set = (i: number, patch: Partial<EditLine>) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const lineTotal = (l: EditLine) => {
    const v = (Number(l.price) || 0) * (Number(l.qty) || 0) * (100 - Math.min(100, Number(l.discount) || 0)) / 100;
    return v ? v.toFixed(2) : "—";
  };

  return (
    <div>
      {msg && <p className="alert-err mb-2">{msg}</p>}
      <div className="relative flex flex-wrap gap-2">
        <input ref={ref} className="input min-w-0 flex-1" placeholder={t.stock.scanOrSearch} value={term} aria-label={t.stock.scanOrSearch}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(true); } }} />
        <button type="button" className="btn-ghost" onClick={() => search(false)}>{t.add}</button>
        <ItemFinderButton t={t} locale={locale} locationId={locationId} onPick={(h, q) => add(h, q)} />
        {hits && (
          <div className="absolute top-full z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-[var(--line)] bg-white shadow-lg">
            {hits.length === 0 && <div className="px-4 py-3 text-sm text-gray-500">{t.stock.notFound}</div>}
            {hits.map((h) => (
              <button key={h.variantId} type="button" onClick={() => add(h)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start text-sm hover:bg-gray-50">
                <span><span className="font-medium">{h.name}</span>{h.options && <span className="text-gray-500"> · {h.options}</span>}</span>
                <span className="font-mono text-xs text-gray-500" dir="ltr">{h.sku ?? ""}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {lines.length > 0 && (
        <div className="overflow-x-auto"><table className="table table-compact mt-4" data-testid="edit-lines">
          <thead><tr><th>{labels.item}</th><th>{labels.qty}</th><th>{labels.price}</th>{mode === "b2b" && <th>{labels.discount}</th>}<th>{labels.lineTotal}</th><th></th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.variantId}>
                <td className="cell-title">{l.name}{l.options && <span className="text-xs text-gray-500"> · {l.options}</span>}<div className="font-mono text-xs text-gray-400" dir="ltr">{l.sku ?? ""}</div>{extra?.(l)}</td>
                <td data-label={labels.qty}><input className="input w-24" dir="ltr" inputMode="decimal" value={l.qty} aria-label={`${labels.qty} ${l.sku ?? l.name}`} onChange={(e) => set(i, { qty: e.target.value })} /></td>
                <td data-label={labels.price}><input className="input w-28" dir="ltr" inputMode="decimal" value={l.price} aria-label={`${labels.price} ${l.sku ?? l.name}`} onChange={(e) => set(i, { price: e.target.value })} /></td>
                {mode === "b2b" && <td data-label={labels.discount}><input className="input w-20" dir="ltr" inputMode="decimal" value={l.discount} placeholder="0" aria-label={`${labels.discount} ${l.sku ?? l.name}`} onChange={(e) => set(i, { discount: e.target.value })} /></td>}
                <td data-label={labels.lineTotal} dir="ltr" className="font-semibold">{lineTotal(l)}</td>
                <td><button type="button" className="text-sm text-red-600 hover:underline" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>{t.stock.remove}</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
