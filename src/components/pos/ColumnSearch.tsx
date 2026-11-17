"use client";

import { useEffect, useRef, useState } from "react";
import type { Dict, Locale } from "@/i18n";
import { finderAction, type ColumnHit, type FinderCol, type FinderFilter, type FinderOp, type VariantHit } from "@/app/actions/stock";
import type { OfflineTill } from "./useOfflineTill";

const TEXT_OPS: FinderOp[] = ["starts", "ends", "contains", "eq"];
const NUM_OPS: FinderOp[] = ["eq", "gt", "gte", "lt", "lte"];
const SYMBOL: Record<FinderOp, string> = { starts: "a*", ends: "*a", contains: "*a*", eq: "=", gt: ">", gte: "≥", lt: "<", lte: "≤" };
const NUMERIC: FinderCol[] = ["price", "cost", "stock"];
/** The match type each column starts with (like the old system: code starts with, name contains). */
const DEFAULT_OP: Record<FinderCol, FinderOp> = { code: "starts", name: "contains", options: "contains", group: "contains", price: "eq", cost: "eq", stock: "gte" };

/** Same rules as the server, for the price list kept on the device (no internet). */
function matches(hay: string, op: FinderOp, v: string): boolean {
  const h = hay.toLowerCase(), x = v.toLowerCase();
  if (op === "starts") return h.startsWith(x);
  if (op === "ends") return h.endsWith(x);
  if (op === "eq") return h === x;
  return h.includes(x);
}
function compare(n: number, op: FinderOp, v: string): boolean {
  const x = Number(v);
  if (!Number.isFinite(x)) return true;
  return op === "gt" ? n > x : op === "gte" ? n >= x : op === "lt" ? n < x : op === "lte" ? n <= x : n === x;
}

/**
 * Item finder: one filter per column, each with its own match type (starts with / ends with /
 * contains / equals; numbers: = > ≥ < ≤). Shows the first 100 and how many match. Tap a row to add;
 * with "ask the quantity" on, a quantity box comes first.
 */
export function ColumnSearch({ t, locale, locationId, onPick, onClose, off }: {
  t: Dict; locale: Locale; locationId: string | null; onPick: (h: VariantHit, qty?: string) => void; onClose: () => void; off?: OfflineTill;
}) {
  const C = t.pos.colSearch;
  const [vals, setVals] = useState<Partial<Record<FinderCol, string>>>({});
  const [ops, setOps] = useState<Record<FinderCol, FinderOp>>(DEFAULT_OP);
  const [showNoStock, setShowNoStock] = useState(false);
  const [askQty, setAskQty] = useState(false);
  const [res, setRes] = useState<{ total: number; rows: ColumnHit[]; canCost: boolean } | null>(null);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState<{ hit: ColumnHit; qty: string } | null>(null);
  const seq = useRef(0);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => { first.current?.focus(); }, []);
  useEffect(() => {
    const filters: FinderFilter[] = (Object.keys(vals) as FinderCol[]).filter((k) => vals[k]?.trim()).map((k) => ({ col: k, op: ops[k], v: vals[k]!.trim() }));
    const my = ++seq.current;
    const local = () => {
      const all = off?.searchAll() ?? [];
      const ok = (h: VariantHit) => filters.every((f) =>
        f.col === "code" ? matches(h.sku ?? "", f.op, f.v) : f.col === "name" ? matches(h.name, f.op, f.v) : f.col === "options" ? matches(h.options, f.op, f.v)
          : f.col === "price" ? compare(Number(h.price), f.op, f.v) : true);
      const hits = all.filter(ok);
      return { total: hits.length, rows: hits.slice(0, 100).map((h) => ({ ...h, group: "", stock: null, cost: null })), canCost: false };
    };
    const id = window.setTimeout(async () => {
      let r: { total: number; rows: ColumnHit[]; canCost: boolean };
      if (off?.enabled && !off.online) { r = local(); setOffline(true); }
      else {
        try { r = await finderAction(filters, { locationId, showNoStock, locale }); setOffline(false); }
        catch { r = off?.enabled ? local() : { total: 0, rows: [], canCost: false }; setOffline(Boolean(off?.enabled)); }
      }
      if (my === seq.current) setRes(r);
    }, 250);
    return () => window.clearTimeout(id);
  }, [vals, ops, showNoStock, locationId, locale, off]);

  const choose = (h: ColumnHit) => (askQty ? setPending({ hit: h, qty: "1" }) : onPick(h));
  const cols: FinderCol[] = ["code", "name", "options", "group", "price", ...(res?.canCost ? (["cost"] as const) : []), ...(locationId ? (["stock"] as const) : [])];
  const label = (k: FinderCol) => C[k];

  return (
    <section className="card space-y-3" data-testid="column-search">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <h3 className="font-semibold text-gray-900">{C.title}</h3>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={showNoStock} disabled={!locationId} onChange={(e) => setShowNoStock(e.target.checked)} />{C.showNoStock}</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={askQty} onChange={(e) => setAskQty(e.target.checked)} />{C.askQty}</label>
        <div className="flex-1" />
        <button type="button" className="font-medium text-[var(--brand)] underline" onClick={onClose}>{C.close}</button>
      </div>
      {offline && <p className="text-xs text-amber-800">{C.offline}</p>}

      {/* one filter per column: match type + value */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {cols.map((k, i) => (
          <div key={k}>
            <div className="mb-1 text-xs font-medium text-gray-600">{label(k)}</div>
            <div className="flex">
              <select aria-label={`${label(k)} · ${C.match}`} title={C.ops[ops[k]]} value={ops[k]} onChange={(e) => setOps({ ...ops, [k]: e.target.value as FinderOp })}
                className="rounded-s-lg border border-e-0 border-[var(--line)] bg-[var(--brand-soft)] px-1.5 text-sm font-semibold text-[var(--brand)]" dir="ltr">
                {(NUMERIC.includes(k) ? NUM_OPS : TEXT_OPS).map((o) => <option key={o} value={o} title={C.ops[o]}>{SYMBOL[o]}</option>)}
              </select>
              <input ref={i === 0 ? first : undefined} aria-label={label(k)} className="input min-w-0 rounded-s-none py-1.5" value={vals[k] ?? ""}
                dir={k === "code" || NUMERIC.includes(k) ? "ltr" : undefined} inputMode={NUMERIC.includes(k) ? "decimal" : undefined}
                onChange={(e) => setVals({ ...vals, [k]: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter" && res?.rows.length === 1) { e.preventDefault(); choose(res.rows[0]); } }} />
            </div>
          </div>
        ))}
      </div>

      {res && (
        <p className="text-sm text-gray-600" data-testid="finder-count">
          {C.firstOf.replace("{n}", String(Math.min(res.rows.length, res.total))).replace("{total}", res.total.toLocaleString(locale === "ar" ? "ar-SA" : "en-US"))}
          {res.total > res.rows.length && <>: {C.narrow}</>}
        </p>
      )}

      {pending && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--brand)] bg-[var(--brand-soft)] p-3" data-testid="finder-qty">
          <span className="font-medium">{pending.hit.name}{pending.hit.options && ` · ${pending.hit.options}`}</span>
          <div className="flex-1" />
          <label className="text-sm">{C.qty}</label>
          <input autoFocus className="input w-24" dir="ltr" inputMode="decimal" value={pending.qty} onChange={(e) => setPending({ ...pending, qty: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter" && Number(pending.qty) > 0) { onPick(pending.hit, pending.qty); setPending(null); } if (e.key === "Escape") setPending(null); }} />
          <button type="button" className="btn-primary" disabled={!(Number(pending.qty) > 0)} onClick={() => { onPick(pending.hit, pending.qty); setPending(null); }}>{C.add}</button>
        </div>
      )}

      {res && res.rows.length === 0 && <p className="text-sm text-gray-500">{C.none}</p>}
      {res && res.rows.length > 0 && (
        <div className="max-h-[28rem] overflow-y-auto">
          <table className="table">
            <thead><tr>{cols.map((k) => <th key={k}>{label(k)}</th>)}<th></th></tr></thead>
            <tbody>
              {res.rows.map((h) => (
                <tr key={h.variantId} className="cursor-pointer hover:bg-gray-50" onClick={() => choose(h)}>
                  <td data-label={C.code} dir="ltr" className="font-mono text-xs">{h.sku ?? "—"}</td>
                  <td data-label={C.name} className="cell-title font-medium">{h.name}</td>
                  <td data-label={C.options}>{h.options || "—"}</td>
                  <td data-label={C.group}>{h.group || "—"}</td>
                  <td data-label={C.price} dir="ltr">{h.price}</td>
                  {res.canCost && <td data-label={C.cost} dir="ltr">{h.cost ?? "—"}</td>}
                  {locationId && <td data-label={C.stock} dir="ltr" className={h.stock !== null && Number(h.stock) <= 0 ? "text-red-600" : ""}>{h.stock ?? "—"}</td>}
                  <td><button type="button" className="btn-ghost py-1 text-sm" onClick={(e) => { e.stopPropagation(); choose(h); }}>{C.add}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
