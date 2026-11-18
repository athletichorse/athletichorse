"use client";

import { useState } from "react";
import { readSheet } from "read-excel-file/browser";
import type { Dict } from "@/i18n";
import { mapPriceSheet, type LevelColumn, type PriceRow } from "@/lib/product-prices";
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
export function PriceFile({ t, levels = [] }: { t: Dict; levels?: (LevelColumn & { label: string })[] }) {
  const p = t.products.pricesFile;
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [items, setItems] = useState<PricePreview[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const label: Record<string, string> = {
    name_en: t.locations.nameEn, name_ar: t.locations.nameAr, price: t.products.price, wholesale: t.products.extras.wholesale, cost: t.products.cost,
    ...Object.fromEntries(levels.map((l) => [`level:${l.id}`, `${t.levels.level}: ${l.label}`])),
  };

  async function pick(file: File) {
    setMsg(null); setItems(null); setBusy(true);
    try {
      const name = file.name.toLowerCase();
      // old Excel (.xls) and OpenDocument (.ods) need a reader that is not installed yet
      if (/\.(xls|ods|numbers)$/.test(name)) { setBusy(false); return setMsg({ ok: false, text: p.oldFormat }); }
      const data: unknown[][] = /\.(csv|txt|tsv)$/.test(name) ? parseCsv(await file.text()) : (await readSheet(file)) as unknown[][];
      const m = mapPriceSheet(data, levels);
      if (!m.columns.includes("sku")) {
        // say which columns the file has, so the person can rename the code column
        const seen = (data.find((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim())) ?? []).map((c) => String(c ?? "").trim()).filter(Boolean).slice(0, 12);
        setBusy(false);
        return setMsg({ ok: false, text: `${p.noSku} ${seen.length ? `${p.columnsSeen}: ${seen.join(" · ")}. ` : ""}${p.skuNames}` });
      }
      setRows(m.rows); setCols([...m.columns.map((c) => label[c] ?? c), ...m.levelColumns.map((id) => label[`level:${id}`] ?? id)]);
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
      {levels.length > 0 && <p className="hint -mt-2" data-testid="level-columns">{t.levels.fileHint} {levels.map((l) => `"${l.label}"`).join(" · ")}</p>}
      <label className="btn-ghost cursor-pointer">
        {p.choose}
        <input type="file" accept=".xlsx,.xlsm,.xls,.ods,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
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
