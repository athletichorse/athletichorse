"use client";

import { useRef, useState } from "react";
import type { Dict, Locale } from "@/i18n";
import { postStockDocAction, searchVariantsAction, type StockKind, type VariantHit } from "@/app/actions/stock";

type Line = { variantId: string; name: string; options: string; sku: string | null; qty: string };
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)));

export function StockDocForm({ t, locale, kind, locations, destinations, defaultLocation, approval }: {
  t: Dict; locale: Locale; kind: StockKind;
  locations: { id: string; name: string }[]; destinations: { id: string; name: string }[];
  defaultLocation: string; approval: boolean;
}) {
  const [loc, setLoc] = useState(defaultLocation);
  const [to, setTo] = useState(destinations.find((d) => d.id !== defaultLocation)?.id ?? "");
  const [lines, setLines] = useState<Line[]>([]);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<VariantHit[] | null>(null);
  const [note, setNote] = useState("");
  const [mgr, setMgr] = useState({ u: "", p: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const clientId = useRef(newId()); // same id on retries → posted at most once
  const searchRef = useRef<HTMLInputElement>(null);

  function add(h: VariantHit) {
    if (h.isService) return setMsg({ ok: false, text: t.stock.service });
    setLines((ls) => {
      const i = ls.findIndex((l) => l.variantId === h.variantId);
      if (i >= 0 && kind !== "count") return ls.map((l, j) => (j === i ? { ...l, qty: String(Number(l.qty || 0) + 1) } : l));
      if (i >= 0) return ls;
      return [...ls, { variantId: h.variantId, name: h.name, options: h.options, sku: h.sku, qty: kind === "count" ? "" : "1" }];
    });
    setTerm("");
    setHits(null);
    setMsg(null);
    searchRef.current?.focus();
  }

  async function search(enter: boolean) {
    const q = term.trim();
    if (!q) return;
    const r = await searchVariantsAction(q, locale);
    if (enter && r.length === 1) return add(r[0]);
    if (enter && r[0]?.exact) return add(r[0]);
    setHits(r);
  }

  async function post() {
    if (!lines.length) return setMsg({ ok: false, text: t.stock.noLines });
    setBusy(true);
    setMsg(null);
    const r = await postStockDocAction({
      clientId: clientId.current, kind, locationId: loc, toLocationId: kind === "transfer" ? to : null, note,
      lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty.trim() })), approverUsername: mgr.u, approverPin: mgr.p,
    });
    setBusy(false);
    if (r.ok) {
      setMsg({ ok: true, text: (r.duplicate ? t.stock.duplicate : t.stock.posted) + r.docNo });
      setLines([]);
      setNote("");
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
        <div className={kind === "transfer" ? "sm:col-span-2" : ""}>
          <label className="label">{t.stock.note}</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">{t.stock.lines} ({lines.length})</h2>
        <div className="relative">
          <input
            ref={searchRef}
            className="input"
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
          {hits && (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-[var(--line)] bg-white shadow-lg">
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
            <thead><tr><th>{t.stock.item}</th><th>SKU</th><th>{qtyLabel}</th><th></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.variantId}>
                  <td className="cell-title">{l.name}{l.options && <div className="text-xs text-gray-500">{l.options}</div>}</td>
                  <td data-label="SKU" className="font-mono text-xs" dir="ltr">{l.sku ?? "—"}</td>
                  <td data-label={qtyLabel}>
                    <input className="input w-28" dir="ltr" inputMode="decimal" value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
                  </td>
                  <td><button type="button" className="text-sm text-red-600 hover:underline" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>{t.stock.remove}</button></td>
                </tr>
              ))}
            </tbody>
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
        <button type="button" className="btn-primary" onClick={post} disabled={busy || !lines.length}>{busy ? t.stock.posting : t.stock.post}</button>
      </div>
    </div>
  );
}
