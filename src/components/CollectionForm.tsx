"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readSheet } from "read-excel-file/browser";
import type { Dict } from "@/i18n";
import { readStatement } from "@/lib/courier-statement";
import { saveCollectionAction } from "@/app/actions/collections";

export type Candidate = { id: string; name: string; courier: string; waybill: string; expected: string; date: string };
type Line = { on: boolean; collected: string; fee: string };

const parseCsv = (text: string) => text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(/[,;\t]/).map((c) => c.replace(/^"|"$/g, "").trim()));
const h = (v: string) => Math.round(Number(v || 0) * 100);
const f2 = (cents: number) => (cents / 100).toFixed(2);

/** New collection: a statement file matched by waybill, or orders ticked by hand. */
export function CollectionForm({ t, candidates, collectedWaybills, couriers }: { t: Dict; candidates: Candidate[]; collectedWaybills: string[]; couriers: string[] }) {
  const C = t.collections;
  const router = useRouter();
  const [courier, setCourier] = useState(couriers[0] ?? "");
  const [ref, setRef] = useState("");
  const [on, setOn] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }));
  const [method, setMethod] = useState<"bank" | "cash">("bank");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [already, setAlready] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const clientId = useRef(crypto.randomUUID());

  const list = useMemo(() => candidates.filter((c) => !courier || c.courier.toLowerCase() === courier.toLowerCase() || lines[c.id]?.on), [candidates, courier, lines]);
  const picked = candidates.filter((c) => lines[c.id]?.on);
  const tot = picked.reduce((a, c) => ({ exp: a.exp + h(c.expected), col: a.col + h(lines[c.id].collected), fee: a.fee + h(lines[c.id].fee) }), { exp: 0, col: 0, fee: 0 });
  const set = (id: string, patch: Partial<Line>, expected: string) => setLines((l) => ({ ...l, [id]: { on: l[id]?.on ?? false, collected: l[id]?.collected ?? expected, fee: l[id]?.fee ?? "0", ...patch } }));

  async function pickFile(file: File) {
    setMsg(null);
    try {
      const data = /\.(csv|txt|tsv)$/i.test(file.name) ? parseCsv(await file.text()) : ((await readSheet(file)) as unknown[][]);
      const st = readStatement(data);
      if (!st.found.waybill) return setMsg({ ok: false, text: C.noWaybillColumn });
      const byWb = new Map(candidates.filter((c) => c.waybill).map((c) => [c.waybill.toUpperCase(), c]));
      const done = new Set(collectedWaybills.map((w) => w.toUpperCase()));
      const next: Record<string, Line> = { ...lines };
      const miss: string[] = [], dup: string[] = [];
      for (const r of st.rows) {
        const c = byWb.get(r.waybill.toUpperCase());
        if (c) next[c.id] = { on: true, collected: st.found.amount ? r.collected : c.expected, fee: r.fee };
        else if (done.has(r.waybill.toUpperCase())) dup.push(r.waybill);
        else miss.push(r.waybill);
      }
      setLines(next); setUnmatched(miss); setAlready(dup);
      setMsg({ ok: true, text: `${C.matched}: ${st.rows.length - miss.length - dup.length} / ${st.rows.length}` });
    } catch (e) { setMsg({ ok: false, text: String(e) }); }
  }

  async function save() {
    if (!courier.trim()) return setMsg({ ok: false, text: C.errors.courier_required });
    if (!picked.length) return setMsg({ ok: false, text: C.errors.no_orders });
    setBusy(true); setMsg(null);
    const r = await saveCollectionAction({ clientId: clientId.current, courier, ref, receivedOn: on, method, notes, lines: picked.map((c) => ({ orderId: c.id, collected: lines[c.id].collected, fee: lines[c.id].fee || "0" })) })
      .catch((e) => ({ ok: false as const, error: String(e) }));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: (C.errors as Record<string, string>)[r.error] ?? r.error });
    setMsg({ ok: true, text: `${C.saved}: ${r.orders} · ${C.received} ${r.received} · ${C.fees} ${r.fees}` });
    setLines({}); setUnmatched([]); setAlready([]); setRef(""); setNotes(""); clientId.current = crypto.randomUUID();
    router.refresh();
  }

  return (
    <section className="card space-y-4" data-testid="collection-form">
      <h2 className="card-title">{C.newTitle}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div><label className="label" htmlFor="col-courier">{C.courier}</label><input id="col-courier" className="input" list="col-couriers" value={courier} onChange={(e) => setCourier(e.target.value)} /><datalist id="col-couriers">{couriers.map((c) => <option key={c} value={c} />)}</datalist></div>
        <div><label className="label" htmlFor="col-ref">{C.ref}</label><input id="col-ref" className="input" dir="ltr" value={ref} onChange={(e) => setRef(e.target.value)} /></div>
        <div><label className="label" htmlFor="col-on">{C.date}</label><input id="col-on" type="date" className="input" dir="ltr" value={on} onChange={(e) => setOn(e.target.value)} /></div>
        <div><label className="label" htmlFor="col-method">{C.method}</label><select id="col-method" className="input" value={method} onChange={(e) => setMethod(e.target.value as "bank" | "cash")}><option value="bank">{C.bank}</option><option value="cash">{C.cash}</option></select></div>
        <div><label className="label" htmlFor="col-notes">{C.notes}</label><input id="col-notes" className="input" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn-ghost cursor-pointer">⬆ {C.uploadStatement}<input type="file" accept=".xlsx,.csv,.tsv,.txt" className="hidden" data-testid="statement-file" onChange={(e) => e.target.files?.[0] && void pickFile(e.target.files[0])} /></label>
        <span className="hint">{C.uploadHint}</span>
      </div>
      {msg && <p className={msg.ok ? "alert-ok" : "alert-err"}>{msg.text}</p>}
      {unmatched.length > 0 && <p className="text-sm text-amber-800" data-testid="unmatched">{C.unmatched}: <span dir="ltr">{unmatched.slice(0, 40).join(", ")}{unmatched.length > 40 ? " …" : ""}</span></p>}
      {already.length > 0 && <p className="text-sm text-gray-600">{C.alreadyCollected}: <span dir="ltr">{already.slice(0, 40).join(", ")}</span></p>}

      {list.length === 0 ? <p className="text-sm text-gray-500">{C.noneWaiting}</p> : (
        <div className="max-h-[28rem] overflow-y-auto">
          <table className="table">
            <thead><tr><th></th><th>{C.order}</th><th>{C.waybill}</th><th>{C.date}</th><th>{C.expected}</th><th>{C.collected}</th><th>{C.fee}</th><th>{C.difference}</th></tr></thead>
            <tbody>
              {list.map((c) => {
                const l = lines[c.id] ?? { on: false, collected: c.expected, fee: "0" };
                const diff = l.on ? h(l.collected) - h(c.expected) : 0;
                return (
                  <tr key={c.id} data-order={c.name} className={l.on ? "bg-[var(--brand-soft)]" : ""}>
                    <td><input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" aria-label={`${C.pick} ${c.name}`} checked={l.on} onChange={(e) => set(c.id, { on: e.target.checked }, c.expected)} /></td>
                    <td className="cell-title font-semibold" dir="ltr">{c.name}<span className="ms-2 text-xs font-normal text-gray-500">{c.courier}</span></td>
                    <td data-label={C.waybill} dir="ltr" className="font-mono text-xs">{c.waybill || "—"}</td>
                    <td data-label={C.date} className="text-xs">{c.date}</td>
                    <td data-label={C.expected} dir="ltr">{c.expected}</td>
                    <td data-label={C.collected}><input className="input w-24 py-1" dir="ltr" inputMode="decimal" aria-label={`${C.collected} ${c.name}`} disabled={!l.on} value={l.collected} onChange={(e) => set(c.id, { collected: e.target.value }, c.expected)} /></td>
                    <td data-label={C.fee}><input className="input w-20 py-1" dir="ltr" inputMode="decimal" aria-label={`${C.fee} ${c.name}`} disabled={!l.on} value={l.fee} onChange={(e) => set(c.id, { fee: e.target.value }, c.expected)} /></td>
                    <td data-label={C.difference} dir="ltr" className={diff < 0 ? "font-semibold text-red-600" : diff > 0 ? "font-semibold text-emerald-700" : "text-gray-400"}>{l.on ? f2(diff) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="collection-totals">
        <span className="badge-gray">{C.orders}: {picked.length}</span>
        <span className="badge-gray">{C.expected}: <span dir="ltr">{f2(tot.exp)}</span></span>
        <span className="badge-gray">{C.collected}: <span dir="ltr">{f2(tot.col)}</span></span>
        <span className="badge-gray">{C.fees}: <span dir="ltr">{f2(tot.fee)}</span></span>
        <span className="badge whitespace-nowrap bg-[var(--brand-soft)] text-[var(--brand)]">{`${C.net}: ${f2(tot.col - tot.fee)}`}</span>
        {tot.col !== tot.exp && picked.length > 0 && <span className="badge whitespace-nowrap bg-red-50 text-red-700">{`${C.difference}: ${f2(tot.col - tot.exp)}`}</span>}
        <div className="flex-1" />
        <button type="button" className="btn-primary" disabled={busy || !picked.length} onClick={() => void save()}>{busy ? "…" : C.save}</button>
      </div>
    </section>
  );
}
