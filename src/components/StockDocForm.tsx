"use client";

import { useRef, useState } from "react";
import type { Dict, Locale } from "@/i18n";
import { postStockDocAction, searchVariantsAction, type StockKind, type VariantHit } from "@/app/actions/stock";
import { looksOffline } from "@/lib/offline";
import { docNumber } from "@/lib/doc-number";
import { StockQueueList, useStockOffline } from "./useStockOffline";
import { ItemFinderButton } from "./ItemFinderButton";

export type StockLine = { variantId: string; name: string; options: string; sku: string | null; qty: string; price?: string };
type Line = StockLine;
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)));

export function StockDocForm({ t, locale, kind, locations, destinations, defaultLocation, approval, initialLines, requestId, defaultTo }: {
  t: Dict; locale: Locale; kind: StockKind;
  locations: { id: string; name: string }[]; destinations: { id: string; name: string }[];
  defaultLocation: string; approval: boolean;
  initialLines?: StockLine[]; requestId?: string; defaultTo?: string;
}) {
  const [loc, setLoc] = useState(defaultLocation);
  const [to, setTo] = useState(defaultTo && defaultTo !== defaultLocation ? defaultTo : destinations.find((d) => d.id !== defaultLocation)?.id ?? "");
  const [lines, setLines] = useState<Line[]>(initialLines ?? []);
  const [reason, setReason] = useState("");
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<VariantHit[] | null>(null);
  const [note, setNote] = useState("");
  const [mgr, setMgr] = useState({ u: "", p: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const clientId = useRef(newId()); // same id on retries → posted at most once
  const searchRef = useRef<HTMLInputElement>(null);
  const off = useStockOffline(locale);
  const errText = (code: string) => (t.stock.errors as Record<string, string>)[code] ?? code;

  /** Adds an item (scan = 1; the item finder may give a quantity). */
  function add(h: VariantHit, qty?: string) {
    if (h.isService) return setMsg({ ok: false, text: t.stock.service });
    const n = qty && Number(qty) > 0 ? qty : null;
    setLines((ls) => {
      const i = ls.findIndex((l) => l.variantId === h.variantId);
      if (i >= 0 && kind !== "count") return ls.map((l, j) => (j === i ? { ...l, qty: String(Number(l.qty || 0) + Number(n ?? 1)) } : l));
      if (i >= 0) return n ? ls.map((l, j) => (j === i ? { ...l, qty: n } : l)) : ls;
      return [...ls, { variantId: h.variantId, name: h.name, options: h.options, sku: h.sku, qty: n ?? (kind === "count" ? "" : "1"), price: h.price }];
    });
    setTerm("");
    setHits(null);
    setMsg(null);
    searchRef.current?.focus();
  }

  async function search(enter: boolean) {
    const q = term.trim();
    if (!q) return;
    let r: VariantHit[];
    try { r = await searchVariantsAction(q, locale); }
    catch (e) {
      if (!looksOffline(e)) throw e;
      if (!off.hasCopy()) return setMsg({ ok: false, text: t.stock.offline.noCopy });
      r = off.searchLocal(q);
      setMsg({ ok: true, text: t.stock.offline.fromCopy });
    }
    if (enter && r.length === 1) return add(r[0]);
    if (enter && r[0]?.exact) return add(r[0]);
    setHits(r);
  }

  async function post() {
    if (!lines.length) return setMsg({ ok: false, text: t.stock.noLines });
    setBusy(true);
    setMsg(null);
    const input = {
      clientId: clientId.current, kind, locationId: loc, toLocationId: kind === "transfer" ? to : null, note, reason, requestId,
      lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty.trim() })),
    };
    let r: Awaited<ReturnType<typeof postStockDocAction>>;
    try { r = await postStockDocAction({ ...input, approverUsername: mgr.u, approverPin: mgr.p }); }
    catch (e) {
      setBusy(false);
      if (!looksOffline(e)) return setMsg({ ok: false, text: String(e) });
      // no internet: keep it on this device (same client id → posted once when sent)
      if (approval) return setMsg({ ok: false, text: t.stock.offline.noApproval });
      const bad = lines.find((l) => !/^\d{1,9}(\.\d{1,3})?$/.test(l.qty.trim()) || (kind !== "count" && Number(l.qty) <= 0));
      if (bad) return setMsg({ ok: false, text: errText("bad_qty") });
      if (kind === "write_off" && !reason) return setMsg({ ok: false, text: errText("reason_required") });
      off.save({ clientId: clientId.current, label: `${t.stock[kind]} · ${lines.length} · ${locations.find((l) => l.id === loc)?.name ?? ""}`, input });
      setMsg({ ok: true, text: t.stock.offline.saved });
      setLines([]); setNote(""); setReason(""); setMgr({ u: "", p: "" });
      clientId.current = newId();
      return;
    }
    setBusy(false);
    if (r.ok) {
      setMsg({ ok: true, text: (r.duplicate ? t.stock.duplicate : t.stock.posted) + docNumber(kind, r.docNo) });
      setLines([]);
      setNote("");
      setReason("");
      setMgr({ u: "", p: "" });
      clientId.current = newId();
    } else {
      setMsg({ ok: false, text: (t.stock.errors as Record<string, string>)[r.error] ?? r.error });
    }
  }

  const qtyLabel = kind === "count" ? t.stock.counted : kind === "adjust" ? t.stock.change : t.stock.qty;
  return (
    <div className="space-y-6">
      {msg && <p className={msg.ok ? "alert-ok" : "alert-err"}>{msg.text}</p>}
      <StockQueueList t={t} off={off} err={errText} />
      <section className="card grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">{kind === "transfer" ? `${t.stock.location} (${t.stock.transfer})` : t.stock.location}</label>
          <select className="input" value={loc} onChange={(e) => setLoc(e.target.value)}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        {kind === "transfer" && (
          <div>
            <label className="label">{t.stock.to}</label>
            <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
              {destinations.filter((d) => d.id !== loc).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
        {kind === "write_off" && (
          <div>
            <label className="label">{t.stock.flow.reason}</label>
            <select className="input" value={reason} onChange={(e) => setReason(e.target.value)} required>
              <option value="">—</option>
              {(Object.keys(t.stock.flow.reasons) as (keyof typeof t.stock.flow.reasons)[]).map((k) => <option key={k} value={k}>{t.stock.flow.reasons[k]}</option>)}
            </select>
          </div>
        )}
        <div className={kind === "transfer" ? "sm:col-span-2" : ""}>
          <label className="label">{t.stock.note}</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">{t.stock.lines} ({lines.length})</h2>
        <div className="relative flex flex-wrap gap-2">
          <input
            ref={searchRef}
            className="input min-w-0 flex-1"
            placeholder={t.stock.scanOrSearch}
            value={term}
            autoFocus
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                search(true);
              }
            }}
          />
          <ItemFinderButton t={t} locale={locale} locationId={loc || null} onPick={(h, q) => add(h, q)} />
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
          <table className="table mt-4">
            <thead><tr><th>{t.stock.item}</th><th>SKU</th><th>{t.stock.flow.price}</th><th>{qtyLabel}</th><th>{t.stock.flow.value}</th><th></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.variantId}>
                  <td className="cell-title">{l.name}{l.options && <div className="text-xs text-gray-500">{l.options}</div>}</td>
                  <td data-label="SKU" className="font-mono text-xs" dir="ltr">{l.sku ?? "—"}</td>
                  <td data-label={t.stock.flow.price} dir="ltr">{l.price ?? "—"}</td>
                  <td data-label={qtyLabel}>
                    <input className="input w-28" dir="ltr" inputMode="decimal" value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
                  </td>
                  <td data-label={t.stock.flow.value} dir="ltr">{l.price && Number(l.qty) ? (Number(l.price) * Number(l.qty)).toFixed(2) : "—"}</td>
                  <td><button type="button" className="text-sm text-red-600 hover:underline" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>{t.stock.remove}</button></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={3} className="font-semibold">{t.stock.flow.total}</td><td className="font-semibold" dir="ltr">{lines.reduce((a, l) => a + (Number(l.qty) || 0), 0)}</td><td className="font-semibold" dir="ltr">{lines.reduce((a, l) => a + (Number(l.price) || 0) * (Number(l.qty) || 0), 0).toFixed(2)}</td><td></td></tr></tfoot>
          </table>
        )}
      </section>

      {approval && (
        <section className="card grid gap-4 border-amber-200 bg-amber-50 sm:grid-cols-2">
          <h2 className="card-title sm:col-span-2">{t.approval.title}</h2>
          <div><label className="label">{t.approval.username}</label><input className="input" dir="ltr" autoCapitalize="none" value={mgr.u} onChange={(e) => setMgr({ ...mgr, u: e.target.value })} /></div>
          <div><label className="label">{t.approval.pin}</label><input className="input" dir="ltr" type="password" inputMode="numeric" value={mgr.p} onChange={(e) => setMgr({ ...mgr, p: e.target.value })} /></div>
        </section>
      )}

      <div className="flex justify-end">
        <button type="button" className="btn-primary" onClick={post} disabled={busy || !lines.length || (kind === "write_off" && !reason)}>{busy ? t.stock.posting : kind === "transfer" ? t.stock.flow.send : t.stock.post}</button>
      </div>
    </div>
  );
}
