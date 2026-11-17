"use client";

import { useEffect, useRef, useState } from "react";
import type { Dict, Locale } from "@/i18n";
import { columnSearchAction, type ColumnFilters, type ColumnHit, type VariantHit } from "@/app/actions/stock";
import type { OfflineTill } from "./useOfflineTill";

/**
 * Search by columns: a table of items with a filter box above each column (name, colour/size,
 * SKU, group, price from–to, stock here). Every filled box must match. Tap a row to add the item.
 * No internet: searches the price list kept on this device (name, colour/size, SKU, price).
 */
export function ColumnSearch({ t, locale, locationId, onPick, onClose, off }: {
  t: Dict; locale: Locale; locationId: string | null; onPick: (h: VariantHit) => void; onClose: () => void; off?: OfflineTill;
}) {
  const C = t.pos.colSearch;
  const [f, setF] = useState<ColumnFilters>({});
  const [rows, setRows] = useState<ColumnHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const any = Object.values(f).some((v) => (typeof v === "string" ? v.trim() : v));
    const my = ++seq.current;
    const id = window.setTimeout(async () => {
      if (!any) { setRows(null); return; }
      const local = () => {
        const has = (hay: string, words?: string) => (words ?? "").toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.toLowerCase().includes(w));
        const all = off?.searchAll() ?? [];
        const min = Number(f.priceMin) || 0, max = Number(f.priceMax) || Infinity;
        return all.filter((h) => has(h.name, f.name) && has(h.options, f.options) && has(h.sku ?? "", f.sku) && Number(h.price) >= min && Number(h.price) <= max)
          .slice(0, 60).map((h) => ({ ...h, group: "", stock: null }));
      };
      setBusy(true);
      let r: ColumnHit[];
      if (off?.enabled && !off.online) { r = local(); setOffline(true); }
      else {
        try { r = await columnSearchAction(f, locationId, locale); setOffline(false); }
        catch { r = off?.enabled ? local() : []; setOffline(Boolean(off?.enabled)); }
      }
      if (my === seq.current) { setRows(r); setBusy(false); }
    }, 300);
    return () => window.clearTimeout(id);
  }, [f, locationId, locale, off]);

  const box = (k: keyof ColumnFilters, ph: string, ltr = false, w = "") => (
    <input className={`input py-1.5 text-sm ${w}`} placeholder={ph} aria-label={ph} dir={ltr ? "ltr" : undefined} inputMode={k === "priceMin" || k === "priceMax" ? "decimal" : undefined}
      value={String(f[k] ?? "")} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
  );

  return (
    <section className="card space-y-3" data-testid="column-search">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-gray-900">{C.title}</h3>
        <span className="hint flex-1">{C.hint}</span>
        <button type="button" className="btn-ghost" onClick={onClose}>{C.close}</button>
      </div>
      {offline && <p className="text-xs text-amber-800">{C.offline}</p>}
      {/* filters: one box per column (wraps on phones) */}
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {box("name", C.name)}
        {box("options", C.options)}
        {box("sku", C.sku, true)}
        {box("group", C.group)}
        <div className="flex gap-1">{box("priceMin", `${C.price} ${C.min}`, true, "min-w-0")}{box("priceMax", C.max, true, "min-w-0")}</div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={Boolean(f.inStock)} disabled={!locationId} onChange={(e) => setF({ ...f, inStock: e.target.checked })} />
          {C.inStock}
        </label>
      </div>
      {busy && !rows && <p className="text-sm text-gray-500">…</p>}
      {rows && rows.length === 0 && <p className="text-sm text-gray-500">{C.none}</p>}
      {rows && rows.length > 0 && (
        <table className="table">
          <thead><tr><th>{C.name}</th><th>{C.options}</th><th>{C.sku}</th><th>{C.group}</th><th>{C.price}</th>{locationId && <th>{C.stock}</th>}<th></th></tr></thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.variantId} className="cursor-pointer hover:bg-gray-50" onClick={() => onPick(h)}>
                <td className="cell-title font-medium">{h.name}</td>
                <td data-label={C.options}>{h.options || "—"}</td>
                <td data-label={C.sku} dir="ltr" className="font-mono text-xs">{h.sku ?? "—"}</td>
                <td data-label={C.group}>{h.group || "—"}</td>
                <td data-label={C.price} dir="ltr">{h.price}</td>
                {locationId && <td data-label={C.stock} dir="ltr" className={h.stock !== null && Number(h.stock) <= 0 ? "text-red-600" : ""}>{h.stock ?? "—"}</td>}
                <td><button type="button" className="btn-ghost py-1 text-sm" onClick={(e) => { e.stopPropagation(); onPick(h); }}>{C.add}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
