"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict, Locale } from "@/i18n";
import { poItemInfoAction, savePurchaseOrderAction, type PackInfo } from "@/app/actions/purchasing";
import { cartons, fill } from "@/lib/logistics";
import { CURRENCIES } from "@/lib/purchasing";
import { LinesEditor, type EditLine } from "./LinesEditor";

export type PoInitial = {
  id: string; supplierId: string; locationId: string; currency: string; rate: string; expectedOn: string; supplierRef: string; notes: string; lines: EditLine[];
};

/** New or changed purchase order: supplier, store, currency + rate, and the items with their unit cost. */
export function PurchaseOrderForm({ t, locale, suppliers, locations, initial, defaultSupplier }: {
  t: Dict; locale: Locale; suppliers: { id: string; name: string; currency: string }[]; locations: { id: string; name: string }[];
  initial?: PoInitial; defaultSupplier?: string;
}) {
  const P = t.purchasing;
  const router = useRouter();
  const first = suppliers.find((s) => s.id === (initial?.supplierId ?? defaultSupplier)) ?? suppliers[0];
  const [supplierId, setSupplierId] = useState(first?.id ?? "");
  const [locationId, setLocationId] = useState(initial?.locationId ?? locations[0]?.id ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? first?.currency ?? "SAR");
  const [rate, setRate] = useState(initial?.rate ?? "1");
  const [expectedOn, setExpectedOn] = useState(initial?.expectedOn ?? "");
  const [supplierRef, setSupplierRef] = useState(initial?.supplierRef ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLinesRaw] = useState<EditLine[]>(initial?.lines ?? []);
  const [info, setInfo] = useState<Record<string, PackInfo>>({});
  // carton / CBM / China price of the items (fetched once per item); the China price fills an empty unit cost when the currency matches
  async function learn(ids: string[], cur: string) {
    const need = ids.filter((v) => !(v in info));
    if (!need.length) return;
    const got = await poItemInfoAction(need).catch(() => ({} as Record<string, PackInfo>));
    setInfo((m) => ({ ...m, ...got }));
    setLinesRaw((ls) => ls.map((l) => (need.includes(l.variantId) && !l.price && got[l.variantId]?.china_price !== null && got[l.variantId]?.china_currency === cur ? { ...l, price: String(got[l.variantId].china_price) } : l)));
  }
  function setLines(f: (l: EditLine[]) => EditLine[]) {
    setLinesRaw((ls) => { const next = f(ls); void learn(next.map((l) => l.variantId), currencyRef.current); return next; });
  }
  const currencyRef = useRef(initial?.currency ?? first?.currency ?? "SAR");
  useEffect(() => { if (initial?.lines.length) void learn(initial.lines.map((l) => l.variantId), currencyRef.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const clientId = useRef(crypto.randomUUID());
  const currencies = [...new Set([...CURRENCIES, ...suppliers.map((s) => s.currency), currency])];
  const total = lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
  currencyRef.current = currency;
  const packs = lines.map((l) => cartons(Number(l.qty) || 0, info[l.variantId]));
  const totCartons = packs.reduce((a, x) => a + (x.cartons ?? 0), 0);
  const totCbm = Math.round(packs.reduce((a, x) => a + (x.cbm ?? 0), 0) * 1000) / 1000;
  const missingPack = lines.filter((l, i) => packs[i].cbm === null).length;
  const expTotal = lines.reduce((a, l) => a + (Number(l.qty) || 0) * (info[l.variantId]?.expected_sar ?? 0), 0);
  const P2 = t.products.logistics;

  function pickSupplier(id: string) {
    setSupplierId(id);
    const s = suppliers.find((x) => x.id === id);
    if (s && !lines.length) { setCurrency(s.currency); if (s.currency === "SAR") setRate("1"); }
  }
  async function save(status: "draft" | "ordered") {
    setBusy(true); setErr("");
    const r = await savePurchaseOrderAction({
      id: initial?.id, clientId: clientId.current, supplierId, locationId, currency, rate: currency === "SAR" ? "1" : rate, expectedOn, supplierRef, notes, status,
      lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty, unitCost: l.price })),
    }).catch(() => ({ ok: false as const, error: "network" }));
    setBusy(false);
    if (!r.ok) return setErr((P.errors as Record<string, string>)[r.error] ?? r.error);
    router.push(`/purchasing/${r.id}?ok=1`);
  }

  if (!suppliers.length) return <p className="card text-sm">{P.addSupplierFirst}</p>;
  return (
    <div className="space-y-4">
      {err && <p className="alert-err">{err}</p>}
      <section className="card grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div><label className="label" htmlFor="po-supplier">{P.supplier}</label>
          <select id="po-supplier" className="input" value={supplierId} onChange={(e) => pickSupplier(e.target.value)}>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></div>
        <div><label className="label" htmlFor="po-store">{P.store}</label>
          <select id="po-store" className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label" htmlFor="po-cur">{P.currency}</label>
            <select id="po-cur" className="input" value={currency} onChange={(e) => { setCurrency(e.target.value); if (e.target.value === "SAR") setRate("1"); }}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select></div>
          <div><label className="label" htmlFor="po-rate">{P.rate}</label>
            <input id="po-rate" className="input" dir="ltr" inputMode="decimal" value={currency === "SAR" ? "1" : rate} disabled={currency === "SAR"} onChange={(e) => setRate(e.target.value)} placeholder={P.rateHint.replace("{cur}", currency)} /></div>
        </div>
        <div><label className="label" htmlFor="po-exp">{P.expected}</label><input id="po-exp" type="date" className="input" value={expectedOn} onChange={(e) => setExpectedOn(e.target.value)} /></div>
        <div><label className="label" htmlFor="po-ref">{P.supplierRef}</label><input id="po-ref" className="input" value={supplierRef} maxLength={60} onChange={(e) => setSupplierRef(e.target.value)} /></div>
        <div><label className="label" htmlFor="po-notes">{P.notes}</label><input id="po-notes" className="input" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} /></div>
      </section>
      <section className="card">
        <h2 className="card-title">{P.items} ({lines.length})</h2>
        <LinesEditor t={t} locale={locale} mode="po" lines={lines} setLines={setLines} locationId={locationId || null}
          labels={{ item: P.item, qty: P.qty, price: `${P.unitCost} (${currency})`, lineTotal: P.lineTotal }}
          extra={(l) => {
            const i = info[l.variantId]; const c = cartons(Number(l.qty) || 0, i);
            if (!i) return null;
            return <div className="text-xs text-gray-500" dir="ltr" data-testid="line-pack">
              {c.cartons !== null ? `${c.cartons} ${P.cartons}${c.cbm !== null ? ` · ${c.cbm} CBM` : ""}` : ""}
              {i.china_price !== null ? ` · ${P2.chinaPrice}: ${i.china_price} ${i.china_currency}` : ""}
              {i.expected_sar !== null ? ` · ${P2.expected}: ${i.expected_sar} SAR` : ""}
            </div>;
          }} />
        {lines.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-end gap-4 text-sm" data-testid="po-total">
            <span>{P.total}: <b dir="ltr">{total.toFixed(2)} {currency}</b></span>
            {currency !== "SAR" && <span>{P.totalSar}: <b dir="ltr">{(total * (Number(rate) || 0)).toFixed(2)} SAR</b></span>}
          </div>
        )}
        {lines.length > 0 && (
          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm" data-testid="po-cbm">
            <div className="flex flex-wrap gap-4"><span>{P.cartonsTotal}: <b dir="ltr">{totCartons}</b></span><span>{P.cbmTotal}: <b dir="ltr">{totCbm} CBM</b></span>{expTotal > 0 && <span>{P2.expectedTotal}: <b dir="ltr">{expTotal.toFixed(2)} SAR</b></span>}</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {fill(totCbm).map((c) => (
                <div key={c.key}>
                  <div className="flex justify-between text-xs"><span>{P.containers[c.key]}</span><span dir="ltr">{c.pct}%</span></div>
                  <div className="h-2 rounded bg-gray-200"><div className={`h-2 rounded ${c.pct > 100 ? "bg-red-600" : "bg-[var(--brand)]"}`} style={{ width: `${Math.min(100, c.pct)}%` }} /></div>
                </div>
              ))}
            </div>
            {missingPack > 0 && <p className="mt-2 text-xs text-amber-700">{P.missingPack.replace("{n}", String(missingPack))}</p>}
          </div>
        )}
      </section>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => save("draft")}>{busy ? P.saving : P.saveDraft}</button>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => save("ordered")} data-testid="po-save-ordered">{busy ? P.saving : P.saveOrdered}</button>
      </div>
    </div>
  );
}
