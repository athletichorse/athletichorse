"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict, Locale } from "@/i18n";
import { b2bCustomersAction, b2bLevelPricesAction, saveB2bOrderAction, type B2bCustomer } from "@/app/actions/b2b";
import { b2bTotals } from "@/lib/purchasing";
import { LinesEditor, type EditLine } from "./LinesEditor";

export type B2bInitial = {
  id: string; customer: B2bCustomer; locationId: string; dueOn: string; customerRef: string; notes: string; lines: EditLine[];
};

/** New or changed B2B order: the customer (their price level fills the prices), the store, the items. */
export function B2bOrderForm({ t, locale, locations, vatRate, initial }: {
  t: Dict; locale: Locale; locations: { id: string; name: string }[]; vatRate: number; initial?: B2bInitial;
}) {
  const B = t.b2b;
  const router = useRouter();
  const [customer, setCustomer] = useState<B2bCustomer | null>(initial?.customer ?? null);
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<B2bCustomer[] | null>(null);
  const [locationId, setLocationId] = useState(initial?.locationId ?? locations[0]?.id ?? "");
  const [dueOn, setDueOn] = useState(initial?.dueOn ?? "");
  const [customerRef, setCustomerRef] = useState(initial?.customerRef ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLinesRaw] = useState<EditLine[]>(initial?.lines ?? []);
  const [levelPrices, setLevelPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const clientId = useRef(crypto.randomUUID());
  const totals = b2bTotals(lines.map((l) => ({ qty: l.qty, price: l.price, discount: l.discount })), vatRate);

  // new items take the customer's level price when it has one
  async function setLines(f: (l: EditLine[]) => EditLine[]) {
    const next = f(lines);
    setLinesRaw(next);
    if (!customer?.levelId) return;
    const fresh = next.filter((l) => !(l.variantId in levelPrices) && !lines.some((o) => o.variantId === l.variantId)).map((l) => l.variantId);
    if (!fresh.length) return;
    const p = await b2bLevelPricesAction(customer.levelId, fresh);
    setLevelPrices((m) => ({ ...m, ...p, ...Object.fromEntries(fresh.filter((v) => !(v in p)).map((v) => [v, ""])) }));
    // only where the price wasn't typed over meanwhile
    setLinesRaw((ls) => ls.map((l) => (fresh.includes(l.variantId) && p[l.variantId] && l.price === l.listPrice ? { ...l, price: p[l.variantId] } : l)));
  }
  async function findCustomer() {
    if (!term.trim()) return;
    const r = await b2bCustomersAction(term, locale);
    if (r.length === 1) { setCustomer(r[0]); setFound(null); setTerm(""); return; }
    setFound(r);
  }
  async function save() {
    if (!customer) return setErr(B.errors.bad_customer);
    setBusy(true); setErr("");
    const r = await saveB2bOrderAction({
      id: initial?.id, clientId: clientId.current, customerId: customer.id, locationId, dueOn, customerRef, notes,
      lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, price: l.price, discount: l.discount })),
    }).catch(() => ({ ok: false as const, error: "network" }));
    setBusy(false);
    if (!r.ok) return setErr((B.errors as Record<string, string>)[r.error] ?? r.error);
    router.push(`/sales/b2b/${r.id}?ok=1`);
  }

  return (
    <div className="space-y-4">
      {err && <p className="alert-err">{err}</p>}
      <section className="card grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="relative sm:col-span-2 lg:col-span-3">
          <label className="label" htmlFor="b2b-cust">{B.customer}</label>
          {customer ? (
            <div className="flex flex-wrap items-center gap-2" data-testid="b2b-customer">
              <span className="font-medium">{customer.name || "—"}</span>
              <span className="text-sm text-gray-500" dir="ltr">#{customer.customerNo} · {customer.phone}</span>
              {customer.levelName && <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-800">{customer.levelName}</span>}
              {!initial && <button type="button" className="text-sm underline" onClick={() => setCustomer(null)}>{t.edit}</button>}
            </div>
          ) : (
            <div className="flex gap-2">
              <input id="b2b-cust" className="input min-w-0 flex-1" placeholder={B.pickCustomer} value={term} onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); findCustomer(); } }} />
              <button type="button" className="btn-ghost" onClick={findCustomer}>{t.add}</button>
            </div>
          )}
          {found && !customer && (
            <div className="absolute top-full z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[var(--line)] bg-white shadow-lg">
              {found.length === 0 && <div className="px-4 py-3 text-sm text-gray-500">{t.stock.notFound}</div>}
              {found.map((c) => (
                <button key={c.id} type="button" className="flex w-full justify-between gap-3 px-4 py-2.5 text-start text-sm hover:bg-gray-50" onClick={() => { setCustomer(c); setFound(null); setTerm(""); }}>
                  <span className="font-medium">{c.name || "—"}</span><span className="text-xs text-gray-500" dir="ltr">#{c.customerNo} · {c.phone}</span>
                </button>
              ))}
            </div>
          )}
          {customer?.levelName && <p className="mt-1 text-xs text-gray-500">{B.levelPrice}: {customer.levelName}</p>}
        </div>
        <div><label className="label" htmlFor="b2b-store">{B.store}</label>
          <select id="b2b-store" className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select></div>
        <div><label className="label" htmlFor="b2b-due">{B.due}</label><input id="b2b-due" type="date" className="input" value={dueOn} onChange={(e) => setDueOn(e.target.value)} /></div>
        <div><label className="label" htmlFor="b2b-ref">{B.customerRef}</label><input id="b2b-ref" className="input" dir="ltr" value={customerRef} maxLength={60} onChange={(e) => setCustomerRef(e.target.value)} /></div>
        <div className="sm:col-span-2 lg:col-span-3"><label className="label" htmlFor="b2b-notes">{B.notes}</label><input id="b2b-notes" className="input" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} /></div>
      </section>
      <section className="card">
        <h2 className="card-title">{B.items} ({lines.length})</h2>
        <LinesEditor t={t} locale={locale} mode="b2b" lines={lines} setLines={setLines} locationId={locationId || null}
          labels={{ item: B.item, qty: B.qty, price: B.price, discount: B.discount, lineTotal: B.lineTotal }} />
        {lines.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-end gap-4 text-sm" data-testid="b2b-totals">
            <span>{B.net}: <b dir="ltr">{totals.net.toFixed(2)}</b></span>
            <span>{B.vat}: <b dir="ltr">{totals.vat.toFixed(2)}</b></span>
            <span>{B.total}: <b dir="ltr">{totals.gross.toFixed(2)} SAR</b></span>
          </div>
        )}
      </section>
      <div className="flex justify-end">
        <button type="button" className="btn-primary" disabled={busy} onClick={save} data-testid="b2b-save">{busy ? B.saving : B.save}</button>
      </div>
    </div>
  );
}
