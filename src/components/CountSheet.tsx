"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict, Locale } from "@/i18n";
import { postStockDocAction } from "@/app/actions/stock";
import { looksOffline } from "@/lib/offline";
import { docNumber } from "@/lib/doc-number";
import { StockQueueList, useStockOffline } from "./useStockOffline";

type Row = { variantId: string; sku: string | null; name: string; options: string; price: string; system: number };
type Key = "sku" | "name" | "price" | "system" | "actual" | "diff";

/** Every item on one page; type the actual stock; sort any column; only typed rows are saved. */
export function CountSheet({ t, locale, locationId, locationName, rows }: { t: Dict; locale: Locale; locationId: string; locationName: string; rows: Row[] }) {
  const F = t.stock.flow;
  const router = useRouter();
  const [actual, setActual] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{ k: Key; dir: 1 | -1 }>({ k: "name", dir: 1 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const clientId = useRef(crypto.randomUUID());
  const off = useStockOffline(locale);
  const errText = (code: string) => (t.stock.errors as Record<string, string>)[code] ?? code;
  const diff = (r: Row) => (actual[r.variantId] === undefined || actual[r.variantId] === "" ? null : Number(actual[r.variantId]) - r.system);
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = rows.filter((r) => !f || `${r.name} ${r.options} ${r.sku ?? ""}`.toLowerCase().includes(f));
    const val = (r: Row): string | number => sort.k === "sku" ? r.sku ?? "" : sort.k === "name" ? `${r.name} ${r.options}` : sort.k === "price" ? Number(r.price) : sort.k === "system" ? r.system : sort.k === "actual" ? Number(actual[r.variantId] ?? -Infinity) : diff(r) ?? -Infinity;
    return [...list].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [rows, filter, sort, actual]); // eslint-disable-line react-hooks/exhaustive-deps
  const typed = rows.filter((r) => actual[r.variantId] !== undefined && actual[r.variantId] !== "");
  const th = (k: Key, label: string) => (
    <th><button type="button" className="font-semibold uppercase" onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>{label}{sort.k === k ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</button></th>
  );
  return (
    <section className="card space-y-3 p-0">
      <div className="space-y-2 px-5 pt-5">
        <p className="hint">{F.countHint}</p>
        <input className="input no-print" placeholder={F.filter} value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="max-h-[70vh] overflow-auto">
        <table className="table" data-export>
          <thead className="sticky top-0 z-10"><tr>{th("sku", "SKU")}{th("name", t.stock.item)}{th("price", F.price)}{th("system", F.systemQty)}{th("actual", F.actualQty)}{th("diff", F.difference)}</tr></thead>
          <tbody>
            {shown.map((r) => {
              const d = diff(r);
              return (
                <tr key={r.variantId}>
                  <td data-label="SKU" className="font-mono text-xs" dir="ltr">{r.sku ?? "—"}</td>
                  <td className="cell-title">{r.name}{r.options && <span className="text-xs text-gray-500"> · {r.options}</span>}</td>
                  <td data-label={F.price} dir="ltr">{Number(r.price).toFixed(2)}</td>
                  <td data-label={F.systemQty}>{r.system}</td>
                  <td data-label={F.actualQty}><input className="input w-24" dir="ltr" inputMode="decimal" value={actual[r.variantId] ?? ""} onChange={(e) => setActual((a) => ({ ...a, [r.variantId]: e.target.value }))} /></td>
                  <td data-label={F.difference} className={d === null ? "text-gray-400" : d < 0 ? "font-semibold text-red-600" : d > 0 ? "font-semibold text-emerald-700" : ""}>{d === null ? "—" : d}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {msg && <p className={`mx-5 ${msg.ok ? "alert-ok" : "alert-err"}`}>{msg.text}</p>}
      <div className="mx-5"><StockQueueList t={t} off={off} err={errText} /></div>
      <div className="flex justify-end px-5 pb-5">
        <button className="btn-primary" disabled={busy || !typed.length} onClick={async () => {
          setBusy(true); setMsg(null);
          const input = { clientId: clientId.current, kind: "count" as const, locationId, lines: typed.map((x) => ({ variantId: x.variantId, qty: actual[x.variantId].trim() })) };
          let r: Awaited<ReturnType<typeof postStockDocAction>>;
          try { r = await postStockDocAction(input); }
          catch (e) {
            setBusy(false);
            if (!looksOffline(e)) return setMsg({ ok: false, text: String(e) });
            if (input.lines.some((l) => !/^\d{1,9}(\.\d{1,3})?$/.test(l.qty))) return setMsg({ ok: false, text: errText("bad_qty") });
            // no internet: the count is kept on this device and posted when the internet is back
            off.save({ clientId: clientId.current, label: `${t.stock.count} · ${input.lines.length} · ${locationName}`, input });
            setMsg({ ok: true, text: t.stock.offline.saved }); setActual({}); clientId.current = crypto.randomUUID();
            return;
          }
          setBusy(false);
          if (r.ok) { setMsg({ ok: true, text: t.stock.posted + docNumber("count", r.docNo) }); setActual({}); clientId.current = crypto.randomUUID(); router.refresh(); }
          else setMsg({ ok: false, text: (t.stock.errors as Record<string, string>)[r.error] ?? r.error });
        }}>{F.saveCount} ({typed.length})</button>
      </div>
    </section>
  );
}
