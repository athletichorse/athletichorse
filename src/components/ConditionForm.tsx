"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict } from "@/i18n";
import { searchVariantsAction, type VariantHit } from "@/app/actions/stock";
import { changeConditionAction, conditionInfoAction } from "@/app/actions/condition";
import { CONDITIONS, type Condition } from "@/lib/condition";

type Info = { onHand: number; good: number; damaged: number; partial: number };
type Pre = { variantId: string; name: string } | null;

/** Pick a store and an item, see how many pieces are sound / damaged / partly faulty, and move some to another condition. */
export function ConditionForm({ t, locale, stores, defaultStore, preset }: { t: Dict; locale: "ar" | "en"; stores: { id: string; name: string }[]; defaultStore: string; preset: Pre }) {
  const C = t.cond;
  const router = useRouter();
  const [store, setStore] = useState(defaultStore);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<VariantHit[]>([]);
  const [item, setItem] = useState<Pre>(preset);
  const [info, setInfo] = useState<Info | null>(null);
  const [from, setFrom] = useState<Condition>("good");
  const [to, setTo] = useState<Condition>("damaged");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const clientId = useRef(crypto.randomUUID());
  const label = (c: Condition) => (c === "good" ? C.good : c === "damaged" ? C.damaged : C.partial);
  const err = (code: string) => (C.errors as Record<string, string>)[code] ?? code;

  useEffect(() => {
    if (!item || !store) return;
    let live = true;
    void conditionInfoAction(store, item.variantId).then((r) => { if (live) setInfo(r); });
    return () => { live = false; };
  }, [item, store]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const r = await searchVariantsAction(q, locale);
    const goods = r.filter((h) => !h.isService);
    if (goods.length === 1 && goods[0].exact) pick(goods[0]); else setHits(goods);
  }
  function pick(h: VariantHit) {
    setItem({ variantId: h.variantId, name: h.options ? `${h.name} · ${h.options}` : h.name });
    setHits([]); setQ(""); setMsg(null);
  }
  async function save() {
    if (!item) return setMsg({ ok: false, text: err("pick_item") });
    setBusy(true); setMsg(null);
    const r = await changeConditionAction({ clientId: clientId.current, locationId: store, variantId: item.variantId, from, to, qty, note });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: err(r.error) });
    clientId.current = crypto.randomUUID();
    setMsg({ ok: true, text: C.saved }); setNote(""); setQty("1");
    setInfo(await conditionInfoAction(store, item.variantId));
    router.refresh();
  }
  const shown = item ? info : null;
  const avail = shown ? (from === "good" ? shown.good : from === "damaged" ? shown.damaged : shown.partial) : 0;
  const btn = (on: boolean) => `rounded-full px-3 py-1.5 text-sm font-medium ${on ? "bg-[var(--brand)] text-white" : "border border-[var(--line)] bg-white text-gray-700"}`;

  return (
    <section className="card mb-4" data-testid="cond-form">
      {msg && <p className={msg.ok ? "alert-ok" : "alert-err"}>{msg.text}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="cond-store">{C.store}</label>
          <select id="cond-store" className="input" value={store} onChange={(e) => setStore(e.target.value)}>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <form onSubmit={search} className="min-w-0">
          <label className="label" htmlFor="cond-q">{C.item}</label>
          <input id="cond-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={C.pick} data-testid="cond-search" />
        </form>
      </div>
      {hits.length > 0 && (
        <ul className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-[var(--line)] bg-white" data-testid="cond-hits">
          {hits.map((h) => (
            <li key={h.variantId}><button type="button" onClick={() => pick(h)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm hover:bg-gray-50">
              <span className="min-w-0 truncate">{h.name}{h.options && <span className="text-gray-500"> · {h.options}</span>}</span>
              <span dir="ltr" className="shrink-0 font-mono text-xs text-gray-500">{h.sku}</span>
            </button></li>
          ))}
        </ul>
      )}
      {item && (
        <div className="mt-4 rounded-lg border border-[var(--line)] p-3">
          <div className="font-semibold text-gray-900" data-testid="cond-item">{item.name}</div>
          {shown && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4" data-testid="cond-info">
              <div><span className="text-gray-500">{C.onHand}</span> <b dir="ltr">{shown.onHand}</b></div>
              <div><span className="text-gray-500">{C.good}</span> <b dir="ltr" className="text-emerald-700">{shown.good}</b></div>
              <div><span className="text-gray-500">{C.damaged}</span> <b dir="ltr" className={shown.damaged ? "text-red-600" : ""}>{shown.damaged}</b></div>
              <div><span className="text-gray-500">{C.partial}</span> <b dir="ltr" className={shown.partial ? "text-red-600" : ""}>{shown.partial}</b></div>
            </div>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="label">{C.from}</div>
              <div className="flex flex-wrap gap-2">{CONDITIONS.map((c) => <button key={c} type="button" className={btn(from === c)} onClick={() => { setFrom(c); if (to === c) setTo(c === "good" ? "damaged" : "good"); }} data-testid={`cond-from-${c}`}>{label(c)}</button>)}</div>
            </div>
            <div>
              <div className="label">{C.to}</div>
              <div className="flex flex-wrap gap-2">{CONDITIONS.filter((c) => c !== from).map((c) => <button key={c} type="button" className={btn(to === c)} onClick={() => setTo(c)} data-testid={`cond-to-${c}`}>{label(c)}</button>)}</div>
            </div>
            <div>
              <label className="label" htmlFor="cond-qty">{C.qty} <span className="text-xs text-gray-500" dir="ltr">(≤ {avail})</span></label>
              <div className="flex gap-2">
                <input id="cond-qty" className="input" dir="ltr" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} data-testid="cond-qty" />
                <button type="button" className="btn-ghost shrink-0" onClick={() => setQty(String(avail))} disabled={!avail}>{C.all}</button>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="cond-note">{C.note}</label>
              <input id="cond-note" className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <button type="button" className="btn-primary mt-3 w-full sm:w-auto" disabled={busy} onClick={() => void save()} data-testid="cond-save">{busy ? C.saving : C.save}</button>
        </div>
      )}
    </section>
  );
}
