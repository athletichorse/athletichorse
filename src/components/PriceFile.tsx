"use client";

import { useState } from "react";
import { readSheet } from "read-excel-file/browser";
import type { Dict } from "@/i18n";
import { mapPriceSheet, type PriceRow } from "@/lib/product-prices";
import { applyPricesAction, previewPricesAction, type PricePreview } from "@/app/actions/products";

/** CSV → rows (handles quotes and a UTF-8 BOM). */
function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === "," || c === ";" || c === "\t") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); out.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((x) => x.trim()));
}

/** Names & prices file: preview old → new, then save. */
export function PriceFile({ t }: { t: Dict }) {
  const p = t.products.pricesFile;
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [items, setItems] = useState<PricePreview[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const label: Record<string, string> = { name_en: t.locations.nameEn, name_ar: t.locations.nameAr, price: t.products.price, wholesale: t.products.extras.wholesale, cost: t.products.cost };

  async function pick(file: File) {
    setMsg(null); setItems(null); setBusy(true);
    try {
      const data: unknown[][] = file.name.toLowerCase().endsWith(".csv") ? parseCsv(await file.text()) : (await readSheet(file)) as unknown[][];
      const m = mapPriceSheet(data);
      if (!m.columns.includes("sku")) { setBusy(false); return setMsg({ ok: false, text: p.noSku }); }
      setRows(m.rows); setCols(m.columns);
      const r = await previewPricesAction(m.rows);
      if (r.ok) setItems(r.items); else setMsg({ ok: false, text: r.error });
    } catch (e) { setMsg({ ok: false, text: String(e) }); }
    setBusy(false);
  }

  const changed = (items ?? []).filter((i) => i.changes.length);
  const missing = (items ?? []).filter((i) => !i.found);
  return (
    <section className="card space-y-4" id="prices">
      <h2 className="card-title">{p.title}</h2>
      <p className="hint -mt-2">{p.hint}</p>
      <label className="btn-ghost cursor-pointer">
        {p.choose}
        <input type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
      </label>
      {busy && <p className="text-sm text-gray-500">…</p>}
      {msg && <p className={msg.ok ? "alert-ok" : "alert-err"}>{msg.text}</p>}
      {items && (
        <>
          <p className="text-sm text-gray-600">{p.understood}: {cols.join(", ")} · {rows.length} {p.rows}{missing.length ? ` · ${p.notFound}: ${missing.length}` : ""}</p>
          {changed.length === 0 ? <p className="text-sm text-gray-500">{p.noChanges}</p> : (
            <div className="max-h-[420px] overflow-auto rounded-lg border border-[var(--line)]">
              <table className="table" data-export>
                <thead><tr><th>SKU</th><th>{t.stock.item}</th><th></th><th>{p.old}</th><th>{p.new}</th></tr></thead>
                <tbody>
                  {changed.slice(0, 500).flatMap((i) => i.changes.map((c, k) => (
                    <tr key={`${i.sku}-${c.field}`}>
                      <td className={k ? "" : "cell-title"} dir="ltr">{k ? "" : i.sku}</td>
                      <td data-label={t.stock.item}>{k ? "" : i.name}</td>
                      <td data-label="">{label[c.field]}</td>
                      <td data-label={p.old} className="text-gray-500">{c.old || "—"}</td>
                      <td data-label={p.new} className="font-medium">{c.new}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          )}
          {missing.length > 0 && <p className="text-xs text-gray-500" dir="ltr">{p.notFound}: {missing.slice(0, 30).map((m) => m.sku).join(", ")}{missing.length > 30 ? " …" : ""}</p>}
          {changed.length > 0 && (
            <button className="btn-primary" disabled={busy} onClick={async () => {
              setBusy(true);
              const r = await applyPricesAction(rows.filter((x) => changed.some((c) => c.sku === x.sku)));
              setBusy(false);
              if (r.ok) { setItems(null); setMsg({ ok: true, text: `${p.applied}: ${r.updated}${r.websiteKept ? ` · ${p.websiteKept}: ${r.websiteKept}` : ""}` }); }
              else setMsg({ ok: false, text: r.error });
            }}>{p.apply} ({changed.length})</button>
          )}
        </>
      )}
    </section>
  );
}
