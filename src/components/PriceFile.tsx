"use client";

import { useState } from "react";
import { readSheet } from "read-excel-file/browser";
import type { Dict } from "@/i18n";
import { mapPriceSheet, type LevelColumn, type PriceRow } from "@/lib/product-prices";
import { applyPricesAction, previewPricesAction, type PricePreview } from "@/app/actions/products";
import { docNumber } from "@/lib/doc-number";

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
export function PriceFile({ t, levels = [], stores = [], canAdd = false }: { t: Dict; levels?: (LevelColumn & { label: string })[]; stores?: (LevelColumn & { label: string })[]; canAdd?: boolean }) {
  const p = t.products.pricesFile;
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [items, setItems] = useState<PricePreview[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const label: Record<string, string> = {
    name_en: t.locations.nameEn, name_ar: t.locations.nameAr, price: t.products.price, wholesale: t.products.extras.wholesale, cost: t.products.cost,
    supplier: t.products.newForm.supplier, factory: t.products.newForm.factory,
    ...Object.fromEntries(levels.map((l) => [`level:${l.id}`, `${t.levels.level}: ${l.label}`])),
    ...Object.fromEntries(stores.map((x) => [`stock:${x.id}`, `${p.qtyIn} ${x.label}`])),
  };
  // one count per store per file (same ids if "save" is pressed twice → posted once)
  const [countIds, setCountIds] = useState<Record<string, string>>({});
  // a quantity column with no store name ("الرصيد"): the person picks the store
  const [hasQty, setHasQty] = useState(false);
  const [qtyStore, setQtyStore] = useState("");
  const [addMissing, setAddMissing] = useState(canAdd);
  const withQty = (rs: PriceRow[], store: string) => (!store ? rs : rs.map((r) => (r.qty === undefined ? r : { ...r, stock: { ...(r.stock ?? {}), [store]: r.qty } })));
  async function preview(rs: PriceRow[], store: string) {
    const r = await previewPricesAction(withQty(rs, store));
    if (r.ok) setItems(r.items); else setMsg({ ok: false, text: r.error });
  }

  async function pick(file: File) {
    setMsg(null); setItems(null); setBusy(true);
    try {
      const name = file.name.toLowerCase();
      // old Excel (.xls) and OpenDocument (.ods) need a reader that is not installed yet
      if (/\.(xls|ods|numbers)$/.test(name)) { setBusy(false); return setMsg({ ok: false, text: p.oldFormat }); }
      const data: unknown[][] = /\.(csv|txt|tsv)$/.test(name) ? parseCsv(await file.text()) : (await readSheet(file)) as unknown[][];
      const m = mapPriceSheet(data, levels, stores);
      setCountIds(Object.fromEntries(m.storeColumns.map((id) => [id, crypto.randomUUID()])));
      if (!m.columns.includes("sku")) {
        // say which columns the file has, so the person can rename the code column
        const seen = (data.find((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim())) ?? []).map((c) => String(c ?? "").trim()).filter(Boolean).slice(0, 12);
        setBusy(false);
        return setMsg({ ok: false, text: `${p.noSku} ${seen.length ? `${p.columnsSeen}: ${seen.join(" · ")}. ` : ""}${p.skuNames}` });
      }
      setRows(m.rows); setCols([...m.columns.filter((c) => c !== "qty").map((c) => label[c] ?? p.colNames[c as keyof typeof p.colNames] ?? c), ...m.levelColumns.map((id) => label[`level:${id}`] ?? id), ...m.storeColumns.map((id) => label[`stock:${id}`] ?? id)]);
      setHasQty(m.columns.includes("qty"));
      setQtyStore("");
      await preview(m.rows, "");
    } catch (e) { setMsg({ ok: false, text: String(e) }); }
    setBusy(false);
  }

  const changed = (items ?? []).filter((i) => i.changes.length);
  const missing = (items ?? []).filter((i) => !i.found);
  const adding = canAdd && addMissing ? missing : [];
  return (
    <section className="card space-y-4" id="prices">
      <h2 className="card-title">{p.title}</h2>
      <p className="hint -mt-2">{p.hint}</p>
      {stores.length > 0 && <p className="hint -mt-2" data-testid="store-columns">{p.storesHint} {stores.map((x) => `"${x.label}"`).join(" · ")}</p>}
      {levels.length > 0 && <p className="hint -mt-2" data-testid="level-columns">{t.levels.fileHint} {levels.map((l) => `"${l.label}"`).join(" · ")}</p>}
      {/* the form to fill in: download, fill, upload back */}
      <div className="flex flex-wrap gap-2" data-testid="price-form-downloads">
        <a href="/upload/template?with=items" download className="btn-ghost">⬇ {p.downloadWithItems}</a>
        <a href="/upload/template" download className="btn-ghost">⬇ {p.downloadEmpty}</a>
      </div>
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
          {hasQty && stores.length > 0 && (
            <label className="flex flex-wrap items-center gap-2 text-sm" data-testid="qty-store">
              <span className="font-medium">{p.qtyStore}</span>
              <select className="input w-auto" value={qtyStore} onChange={(e) => { setQtyStore(e.target.value); setBusy(true); void preview(rows, e.target.value).finally(() => setBusy(false)); }}>
                <option value="">{p.qtyIgnore}</option>
                {stores.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </label>
          )}
          {canAdd && missing.length > 0 && (
            <label className="flex items-start gap-2 text-sm" data-testid="add-missing">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--brand)]" checked={addMissing} onChange={(e) => setAddMissing(e.target.checked)} />
              <span><span className="font-medium">{p.addMissing} ({missing.length})</span><span className="hint block">{p.addMissingHint}</span></span>
            </label>
          )}
          {(changed.length > 0 || adding.length > 0) && (
            <button className="btn-primary" disabled={busy} onClick={async () => {
              setBusy(true);
              const send = withQty(rows, qtyStore).filter((x) => changed.some((c) => c.sku === x.sku) || adding.some((m) => m.sku === x.sku));
              const r = await applyPricesAction(send, countIds, { addMissing: adding.length > 0 });
              setBusy(false);
              if (r.ok) {
                setItems(null);
                const cs = r.counts.map((c) => `${stores.find((x) => x.id === c.location)?.label ?? ""} ${docNumber("count", c.docNo)}`).join(" · ");
                setMsg({ ok: true, text: `${p.applied}: ${r.updated}${r.added ? ` · ${p.added}: ${r.added}` : ""}${r.activated ? ` · ${p.activated}: ${r.activated}` : ""}${r.websiteKept ? ` · ${p.websiteKept}: ${r.websiteKept}` : ""}${cs ? ` · ${p.countsPosted}: ${cs}` : ""}` });
              }
              else setMsg({ ok: false, text: r.error });
            }}>{p.apply} ({changed.length + adding.length})</button>
          )}
        </>
      )}
    </section>
  );
}
