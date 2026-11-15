"use client";

import { useMemo, useRef, useState } from "react";
import type { Dict, Locale } from "@/i18n";
import { searchVariantsAction, type VariantHit } from "@/app/actions/stock";
import { LABEL_PRESETS, labelsDocument, type LabelItem, type LabelPreset, type LabelSettings } from "@/lib/labels";

type Row = LabelItem & { variantId: string };

/** Barcode stickers: pick items, choose the printer/sticker, preview, print. */
export function LabelPrinter({ t, locale, initial }: { t: Dict; locale: Locale; initial: Row[] }) {
  const L = t.products.labels;
  const [rows, setRows] = useState<Row[]>(initial);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<VariantHit[] | null>(null);
  const [preset, setPreset] = useState<LabelPreset>("zebra");
  const [s, setS] = useState<LabelSettings>({ w: 40, h: 25, margin: 1, scale: 100, style: "standard", showName: true, showPrice: true });
  const ref = useRef<HTMLInputElement>(null);

  const doc = useMemo(() => labelsDocument(rows.filter((r) => r.sku), s, L.title), [rows, s, L.title]);
  const add = (h: VariantHit) => {
    if (!h.sku) return;
    setRows((rs) => rs.some((r) => r.variantId === h.variantId) ? rs.map((r) => (r.variantId === h.variantId ? { ...r, qty: r.qty + 1 } : r))
      : [...rs, { variantId: h.variantId, sku: h.sku!, name: h.name, options: h.options, price: h.price, qty: 1 }]);
    setTerm(""); setHits(null); ref.current?.focus();
  };
  const setPresetSize = (p: LabelPreset) => { setPreset(p); if (p !== "custom") setS((x) => ({ ...x, ...LABEL_PRESETS[p] })); };
  const num = (k: "w" | "h" | "margin" | "scale", label: string) => (
    <div><label className="label">{label}</label>
      <input className="input" type="number" dir="ltr" value={s[k]} disabled={(k === "w" || k === "h") && preset !== "custom"}
        onChange={(e) => setS((x) => ({ ...x, [k]: Number(e.target.value) }))} /></div>
  );
  function print() {
    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) return;
    w.document.open(); w.document.write(doc.html.replace("</body>", "<script>window.onload=function(){window.print()}</script></body>")); w.document.close();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <section className="card space-y-3">
        <div className="relative">
          <input ref={ref} className="input" placeholder={L.search} value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={async (e) => {
            if (e.key !== "Enter") return; e.preventDefault();
            const r = await searchVariantsAction(term, locale);
            if (r.length === 1 || r[0]?.exact) add(r[0]); else setHits(r);
          }} />
          {hits && (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-[var(--line)] bg-white shadow-lg">
              {hits.length === 0 && <div className="px-4 py-3 text-sm text-gray-500">{t.stock.notFound}</div>}
              {hits.map((h) => (
                <button key={h.variantId} type="button" disabled={!h.sku} onClick={() => add(h)} className="flex w-full justify-between gap-3 px-4 py-2.5 text-start text-sm hover:bg-gray-50 disabled:opacity-40">
                  <span>{h.name}{h.options && <span className="text-gray-500"> · {h.options}</span>}</span><span className="text-xs text-gray-500" dir="ltr">{h.sku ?? "—"} · {h.price}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {rows.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">{L.empty}</p> : (
          <table className="table">
            <thead><tr><th>{t.stock.item}</th><th>SKU</th><th>{t.products.price}</th><th>{L.qty}</th><th></th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.variantId}>
                  <td className="cell-title">{r.name}{r.options && <div className="text-xs text-gray-500">{r.options}</div>}</td>
                  <td data-label="SKU" dir="ltr" className="font-mono text-xs">{r.sku}</td>
                  <td data-label={t.products.price}>{r.price}</td>
                  <td data-label={L.qty}><input className="input w-20" type="number" min={0} dir="ltr" value={r.qty} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, qty: Math.max(0, Number(e.target.value) || 0) } : x)))} /></td>
                  <td><button className="text-sm text-red-600 hover:underline" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>{L.remove}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {doc.count > 0 && (
          <div>
            <div className="mb-2 text-sm font-medium text-gray-700">{L.preview}</div>
            <iframe title={L.preview} srcDoc={doc.html} className="h-56 w-full rounded-lg border border-[var(--line)] bg-gray-100" />
          </div>
        )}
      </section>

      <aside className="card space-y-3">
        <div><label className="label">{L.preset}</label>
          <select className="input" value={preset} onChange={(e) => setPresetSize(e.target.value as LabelPreset)}>
            <option value="zebra">{L.zebra}</option><option value="xprinter">{L.xprinter}</option><option value="custom">{L.custom}</option>
          </select></div>
        <div className="grid grid-cols-2 gap-3">{num("w", L.width)}{num("h", L.height)}{num("margin", L.margin)}{num("scale", L.scale)}</div>
        <div><label className="label">{L.style}</label>
          <select className="input" value={s.style} onChange={(e) => setS((x) => ({ ...x, style: e.target.value as LabelSettings["style"] }))}>
            <option value="standard">{L.styleNew}</option><option value="classic">{L.styleOld}</option>
          </select></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.showName} onChange={(e) => setS((x) => ({ ...x, showName: e.target.checked }))} className="h-4 w-4 accent-[var(--brand)]" /> {L.showName}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.showPrice} onChange={(e) => setS((x) => ({ ...x, showPrice: e.target.checked }))} className="h-4 w-4 accent-[var(--brand)]" /> {L.showPrice}</label>
        <button className="btn-primary w-full" disabled={!doc.count} onClick={print}>{L.print} ({doc.count} {L.total})</button>
      </aside>
    </div>
  );
}
