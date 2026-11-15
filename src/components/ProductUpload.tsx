"use client";

import Link from "next/link";
import { useState } from "react";
import { readSheet } from "read-excel-file/browser";
import type { Dict } from "@/i18n";
import { chunk } from "@/lib/shopify";
import { convertPrice, mapSheet, type MappedSheet, type Rate } from "@/lib/product-import";
import { importProductsChunk } from "@/app/actions/upload";

const DEFAULT_RATES: Record<string, { from: string; to: string }> = { EGP: { from: "13", to: "1.8" } };

export function ProductUpload({ t }: { t: Dict }) {
  const [sheet, setSheet] = useState<MappedSheet | null>(null);
  const [rate, setRate] = useState<Rate>({ from: "1", to: "1", whole: false });
  const [busy, setBusy] = useState<"" | "reading" | "importing">("");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState("");

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setResult(null);
    setSheet(null);
    setBusy("reading");
    try {
      let data;
      try {
        data = await readSheet(file, "Products");
      } catch {
        data = await readSheet(file);
      }
      const m = mapSheet(data as unknown[][]);
      setSheet(m);
      const d = m.currency && m.currency !== "SAR" ? DEFAULT_RATES[m.currency] : undefined;
      setRate(d ? { ...d, whole: true } : { from: "1", to: "1", whole: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function run() {
    if (!sheet) return;
    setBusy("importing");
    setError("");
    setProgress(0);
    const total: Record<string, number> = {};
    const parts = chunk(sheet.rows, 300);
    for (let i = 0; i < parts.length; i++) {
      const r = await importProductsChunk(parts[i], rate);
      if (!r.ok) {
        setError(`${t.upload.error}: ${r.error}`);
        setBusy("");
        setResult(total);
        return;
      }
      for (const [k, v] of Object.entries(r.counts)) total[k] = (total[k] ?? 0) + Number(v);
      setProgress(Math.round(((i + 1) / parts.length) * 100));
    }
    setResult(total);
    setBusy("");
  }

  const previewPrice = (src: string | null) => {
    try {
      return convertPrice(src, rate) ?? "—";
    } catch {
      return "—"; // rate being typed
    }
  };
  const converting = sheet?.currency && sheet.currency !== "SAR";

  return (
    <div className="space-y-6">
      <section className="card">
        <label className="btn-primary cursor-pointer">
          {busy === "reading" ? t.upload.reading : t.upload.choose}
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} disabled={busy !== ""} />
        </label>
        <p className="hint mt-3">{t.upload.brandNote}</p>
      </section>

      {error && <p className="alert-err">{error}</p>}

      {sheet && (
        <>
          <section className="card">
            <h2 className="card-title">{t.upload.summary}</h2>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div><dt className="text-sm text-gray-500">{t.upload.rows}</dt><dd className="text-2xl font-semibold">{sheet.rows.length}</dd></div>
              <div><dt className="text-sm text-gray-500">{t.upload.withPrice}</dt><dd className="text-2xl font-semibold">{sheet.rows.filter((r) => r.price_src).length}</dd></div>
              <div><dt className="text-sm text-gray-500">{t.upload.skipped}</dt><dd className="text-2xl font-semibold">{sheet.skipped}</dd></div>
            </dl>
            {sheet.ignoredStockColumns > 0 && <p className="hint mt-3">{t.upload.stockIgnored}</p>}
          </section>

          {converting && (
            <section className="card">
              <h2 className="card-title">{t.upload.priceRule}</h2>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <input className="input w-24" dir="ltr" inputMode="decimal" value={rate.from} onChange={(e) => setRate({ ...rate, from: e.target.value })} />
                <span className="font-medium">{sheet.currency}</span>
                <span>{t.upload.equals}</span>
                <input className="input w-24" dir="ltr" inputMode="decimal" value={rate.to} onChange={(e) => setRate({ ...rate, to: e.target.value })} />
                <span className="font-medium">SAR</span>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={rate.whole} onChange={(e) => setRate({ ...rate, whole: e.target.checked })} className="h-4 w-4 accent-[var(--brand)]" /> {t.upload.wholeRiyal}
              </label>
            </section>
          )}

          <section className="card overflow-hidden p-0">
            <h2 className="card-title px-5 pt-5">{t.upload.preview}</h2>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>SKU</th><th>{t.products.name}</th><th>{t.products.group}</th>{converting && <th>{sheet.currency}</th>}<th>SAR</th></tr></thead>
                <tbody>
                  {sheet.rows.slice(0, 8).map((r) => (
                    <tr key={r.ref}>
                      <td className="font-mono text-xs" dir="ltr">{r.ref}</td>
                      <td>{r.name_en || r.name_ar}{r.name_en && r.name_ar && <div dir="rtl" className="text-start text-xs text-gray-500">{r.name_ar}</div>}</td>
                      <td>{r.group_en || r.group_ar || "—"}</td>
                      {converting && <td>{r.price_src ?? "—"}</td>}
                      <td className="font-medium">{previewPrice(r.price_src)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {!result && (
            <div className="flex items-center justify-end gap-4">
              {busy === "importing" && (
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200"><div className="h-full bg-[var(--brand)] transition-all" style={{ width: `${progress}%` }} /></div>
              )}
              <button className="btn-primary" onClick={run} disabled={busy !== "" || sheet.rows.length === 0}>
                {busy === "importing" ? `${t.upload.importing} ${progress}%` : t.upload.import}
              </button>
            </div>
          )}
        </>
      )}

      {result && (
        <section className="card">
          <h2 className="card-title">{error ? t.upload.error : t.upload.done}</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {([
              ["products_created", t.upload.created],
              ["matched_website", t.upload.matchedWebsite],
              ["updated", t.upload.updated],
              ["codes_added", t.upload.codesAdded],
              ["images", t.upload.images],
              ["ambiguous_skipped", t.upload.ambiguous],
            ] as const).map(([k, label]) => (
              <div key={k}><dt className="text-sm text-gray-500">{label}</dt><dd className="text-2xl font-semibold">{result[k] ?? 0}</dd></div>
            ))}
          </dl>
          <div className="mt-5 flex justify-end"><Link href="/products" className="btn-primary">{t.upload.openProducts}</Link></div>
        </section>
      )}
    </div>
  );
}
