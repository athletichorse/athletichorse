"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readSheet } from "read-excel-file/browser";
import type { Dict, Locale } from "@/i18n";
import { matchCodesAction, saveChinaOrderAction, type CodeMatch } from "@/app/actions/purchasing";
import { searchVariantsAction, type VariantHit } from "@/app/actions/stock";
import { CN_CONTAINERS, landed, parseCsvRows, readChinaSheet, type CnLine } from "@/lib/china";

export type CnInitial = {
  id: string; poId: string; status: string; supplierId: string; locationId: string; title: string; container: string;
  rate: string; ratePaid: string; feeShipping: string; feeCustoms: string; feeOther: string; notes: string; lines: (CnLine & { name?: string | null })[];
};
type Line = CnLine & { key: string; name?: string | null };
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()));
const f0 = (x: number) => Math.round(x).toLocaleString("en-US");
const f2 = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** China (container) order: supplier sheet → lines; container fill; rate; fees spread on the items → landed cost per piece (SAR). */
export function ChinaOrderForm({ t, locale, suppliers, locations, initial, editable }: {
  t: Dict; locale: Locale; suppliers: { id: string; name: string }[]; locations: { id: string; name: string }[]; initial?: CnInitial; editable: boolean;
}) {
  const C = t.cn;
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? "");
  const [locationId, setLocationId] = useState(initial?.locationId ?? locations[0]?.id ?? "");
  const [container, setContainer] = useState(initial?.container || "40ft");
  const [status, setStatus] = useState<"draft" | "ordered" | "shipped">((["draft", "ordered", "shipped"].includes(initial?.status ?? "") ? initial!.status : "draft") as "draft" | "ordered" | "shipped");
  const [fees, setFees] = useState({ rate: initial?.rate ?? "", rate_paid: initial?.ratePaid ?? "", fee_shipping: initial?.feeShipping ?? "", fee_customs: initial?.feeCustoms ?? "", fee_other: initial?.feeOther ?? "" });
  const [lines, setLinesRaw] = useState<Line[]>((initial?.lines ?? []).map((l) => ({ ...l, key: newKey() })));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<VariantHit[] | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [linkTerm, setLinkTerm] = useState("");
  const [linkHits, setLinkHits] = useState<VariantHit[] | null>(null);
  const clientId = useRef(crypto.randomUUID());
  const setLines = (f: (l: Line[]) => Line[]) => { setLinesRaw(f); setDirty(true); };
  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const calc = useMemo(() => landed(lines, fees), [lines, fees]);
  const cap = CN_CONTAINERS.find((c) => c.key === container)?.cbm ?? 58;
  const pct = cap ? Math.round((calc.totCbm / cap) * 1000) / 10 : 0;
  const linked = lines.filter((l) => l.variant_id).length;
  const ro = !editable;

  async function upload(file: File) {
    setMsg(null);
    try {
      const rows = /\.(csv|txt|tsv)$/i.test(file.name) ? parseCsvRows(await file.text()) : ((await readSheet(file)) as unknown[][]);
      const r = readChinaSheet(rows);
      if (!r.lines.length) return setMsg({ ok: false, text: C.noHeader });
      const match = await matchCodesAction(r.lines.map((l) => l.supplier_code), locale).catch(() => ({} as Record<string, CodeMatch>));
      const add: Line[] = r.lines.map((l) => {
        const m = match[l.supplier_code];
        return { ...l, key: newKey(), variant_id: m?.variant_id ?? null, sku: m?.sku ?? null, name: m?.name ?? null, image_url: m?.image_url ?? null };
      });
      setLines((ls) => [...ls.filter((x) => x.supplier_code || x.description || x.variant_id), ...add]);
      setMsg({ ok: true, text: C.uploaded.replace("{n}", String(add.length)).replace("{m}", String(add.filter((x) => x.variant_id).length)) });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }
  async function search(q: string, set: (h: VariantHit[]) => void) {
    if (!q.trim()) return;
    set(await searchVariantsAction(q.trim(), locale).catch(() => []));
  }
  async function addItem(h: VariantHit) {
    const m = h.sku ? (await matchCodesAction([h.sku], locale).catch(() => ({} as Record<string, CodeMatch>)))[h.sku] : undefined;
    setLines((ls) => [...ls, { key: newKey(), supplier_code: h.sku ?? "", description: h.name, variant_id: h.variantId, sku: h.sku, name: `${h.name}${h.options ? ` · ${h.options}` : ""}`, image_url: h.image,
      cartons: "", per_carton: m?.per_carton ? String(m.per_carton) : "1", unit_price: m?.china_price !== null && m?.china_price !== undefined && (m.china_currency ?? "CNY") === "CNY" ? String(m.china_price) : "", carton_cbm: m?.carton_cbm ? String(m.carton_cbm) : "" }]);
    setTerm(""); setHits(null);
  }
  async function link(key: string, h: VariantHit) {
    setLinking(null); setLinkTerm(""); setLinkHits(null);
    const m = h.sku ? (await matchCodesAction([h.sku], locale).catch(() => ({} as Record<string, CodeMatch>)))[h.sku] : undefined;
    // the sheet's numbers win; the item's saved numbers only fill what is empty
    setLines((ls) => ls.map((l) => (l.key !== key ? l : {
      ...l, variant_id: h.variantId, sku: h.sku, name: `${h.name}${h.options ? ` · ${h.options}` : ""}`, image_url: l.image_url || h.image,
      per_carton: l.per_carton && l.per_carton !== "1" ? l.per_carton : m?.per_carton ? String(m.per_carton) : l.per_carton,
      carton_cbm: l.carton_cbm || (m?.carton_cbm ? String(m.carton_cbm) : ""),
      unit_price: l.unit_price || (m?.china_price !== null && m?.china_price !== undefined && (m.china_currency ?? "CNY") === "CNY" ? String(m.china_price) : ""),
    })));
  }
  async function save() {
    setBusy(true); setMsg(null);
    const r = await saveChinaOrderAction({
      id: initial?.poId, clientId: clientId.current, supplierId, locationId, title, container, status, rate: fees.rate, ratePaid: fees.rate_paid,
      feeShipping: fees.fee_shipping, feeCustoms: fees.fee_customs, feeOther: fees.fee_other, notes: initial?.notes ?? "",
      lines: lines.map(({ supplier_code, description, variant_id, cartons, per_carton, unit_price, carton_cbm, image_url }) => ({ supplier_code, description, variant_id, cartons, per_carton, unit_price, carton_cbm, image_url })),
    }).catch(() => ({ ok: false as const, error: "network" }));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: (t.purchasing.errors as Record<string, string>)[r.error] ?? r.error });
    setDirty(false);
    router.push(`/purchasing/china/${r.id}?ok=1`);
    router.refresh();
  }

  const input = (value: string, on: (v: string) => void, label: string, cls = "w-20", mode: "decimal" | "numeric" = "decimal") => (
    <input className={`input px-2 py-1.5 ${cls}`} dir="ltr" inputMode={mode} value={value} disabled={ro} aria-label={label} onChange={(e) => on(e.target.value)} />
  );

  return (
    <div className="space-y-4">
      {msg && <p className={msg.ok ? "alert-ok" : "alert-err"} role="status">{msg.text}</p>}

      <section className="card">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="card-title mb-0 flex-1">{C.details}</h2>
          {editable && <label className="btn-ghost cursor-pointer">⬆ {C.upload}<input type="file" accept=".xlsx,.csv,.tsv,.txt" className="hidden" data-testid="cn-sheet" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} /></label>}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
          <div><label className="label" htmlFor="cn-title">{C.name}</label><input id="cn-title" className="input" value={title} placeholder={C.namePh} maxLength={120} disabled={ro} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} /></div>
          <div><label className="label" htmlFor="cn-sup">{C.supplier}</label>
            <select id="cn-sup" className="input" value={supplierId} disabled={ro} onChange={(e) => { setSupplierId(e.target.value); setDirty(true); }}>
              <option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div><span className="label">{C.container}</span>
            <div className="flex gap-2" role="radiogroup" aria-label={C.container}>
              {CN_CONTAINERS.map((c) => (
                <button key={c.key} type="button" role="radio" aria-checked={container === c.key} disabled={ro} onClick={() => { setContainer(c.key); setDirty(true); }}
                  className={`rounded-xl border px-4 py-2 text-center ${container === c.key ? "border-[var(--brand)] bg-[var(--brand)]/10" : "border-[var(--line)]"}`} data-testid={`cn-c-${c.key}`}>
                  <div className="font-semibold" dir="ltr">{c.key === "40hc" ? "40 HC" : c.key.replace("ft", " ft")}</div><div className="text-xs text-gray-500" dir="ltr">~{c.cbm} CBM</div>
                </button>
              ))}
            </div></div>
          <div><label className="label" htmlFor="cn-store">{C.store}</label>
            <select id="cn-store" className="input" value={locationId} disabled={ro} onChange={(e) => { setLocationId(e.target.value); setDirty(true); }}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select></div>
          <div className="lg:col-span-2"><span className="label">{C.status}</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={C.status}>
              {(["draft", "ordered", "shipped"] as const).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={status === s} disabled={ro} onClick={() => { setStatus(s); setDirty(true); }}
                  className={status === s ? "btn-primary rounded-full py-1.5" : "btn-ghost rounded-full py-1.5"} data-testid={`cn-s-${s}`}>{C.statuses[s]}</button>
              ))}
              {initial && ["partial", "received"].includes(initial.status) && <span className="badge-green">{C.statuses[initial.status as "partial" | "received"]}</span>}
            </div></div>
        </div>
        {editable && <p className="mt-3 text-xs text-gray-500">{C.uploadHint} {C.remembered}</p>}
      </section>

      <section className="card sticky top-2 z-10 flex flex-wrap items-center gap-6 shadow-md" data-testid="cn-summary">
        <div className="min-w-48">
          <div className="h-5 overflow-hidden rounded border border-gray-400"><div className={`h-full ${pct > 100 ? "bg-red-600" : "bg-[var(--brand)]"}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
          <div className="mt-1 flex justify-between gap-3 text-xs" dir="ltr"><span>{calc.totCbm} / {cap} CBM · {pct}% {C.used}</span><span className="text-emerald-700">{C.free} {Math.max(0, Math.round((cap - calc.totCbm) * 100) / 100)}</span></div>
        </div>
        <div><div className="text-xs text-gray-500">{C.goods}</div><div className="text-xl font-semibold" dir="ltr">{f2(calc.goodsSar)}</div></div>
        <div><div className="text-xs text-gray-500">{C.fees}</div><div className="text-xl font-semibold" dir="ltr">{f2(calc.fees)} <span className="text-xs font-normal text-gray-500">· {calc.feePct}%</span></div></div>
        <div><div className="text-xs text-gray-500">{C.rateDiff}</div><div className="text-xl font-semibold" dir="ltr">{calc.rateDiff === null ? "—" : f2(calc.rateDiff)}</div></div>
        <div><div className="text-xs text-gray-500">{C.total}</div><div className="text-2xl font-bold" dir="ltr" data-testid="cn-total">{f2(calc.total)} SAR</div></div>
        <div className="ms-auto text-end">
          {editable && <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()} data-testid="cn-save">{busy ? C.saving : C.save}</button>}
          {dirty && editable && <div className="mt-1 text-xs text-amber-700">{C.unsaved}</div>}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card">
          <h2 className="card-title">{C.rateTitle}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="cn-rate">{C.rate}</label><input id="cn-rate" className="input" dir="ltr" inputMode="decimal" value={fees.rate} disabled={ro} onChange={(e) => { setFees({ ...fees, rate: e.target.value }); setDirty(true); }} /></div>
            <div><label className="label" htmlFor="cn-paid">{C.ratePaid}</label><input id="cn-paid" className="input" dir="ltr" inputMode="decimal" value={fees.rate_paid} disabled={ro} onChange={(e) => { setFees({ ...fees, rate_paid: e.target.value }); setDirty(true); }} /></div>
          </div>
          <div className="mt-3 flex items-start justify-between rounded-lg bg-gray-50 p-3"><div><div className="font-medium">{C.rateDiffTitle}</div><p className="text-xs text-gray-500">{C.rateDiffHint}</p></div><b dir="ltr">{calc.rateDiff === null ? "—" : f2(calc.rateDiff)}</b></div>
        </section>
        <section className="card">
          <h2 className="card-title">{C.feesTitle}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="label" htmlFor="cn-ship">{C.shipping}</label><input id="cn-ship" className="input" dir="ltr" inputMode="decimal" value={fees.fee_shipping} disabled={ro} onChange={(e) => { setFees({ ...fees, fee_shipping: e.target.value }); setDirty(true); }} /></div>
            <div><label className="label" htmlFor="cn-cust">{C.customs}</label><input id="cn-cust" className="input" dir="ltr" inputMode="decimal" value={fees.fee_customs} disabled={ro} onChange={(e) => { setFees({ ...fees, fee_customs: e.target.value }); setDirty(true); }} /></div>
            <div><label className="label" htmlFor="cn-other">{C.other}</label><input id="cn-other" className="input" dir="ltr" inputMode="decimal" value={fees.fee_other} disabled={ro} onChange={(e) => { setFees({ ...fees, fee_other: e.target.value }); setDirty(true); }} /></div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg bg-gray-50 p-3"><span className="font-medium">{C.feeLoad}</span><b className="text-2xl" dir="ltr">{calc.feePct}%</b></div>
          <p className="mt-2 text-xs text-gray-500">{C.feesHint.replace("{x}", calc.goodsSar > 0 ? f2((calc.fees / calc.goodsSar) * 100) : "0")}</p>
          <p className="mt-1 text-sm">{C.avgUnit}: <b dir="ltr">{calc.avgUnit === null ? "—" : `${f2(calc.avgUnit)} SAR`}</b></p>
        </section>
      </div>

      <section className="card overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-3 px-5 pt-5">
          <h2 className="card-title mb-0">{C.items} ({lines.length})</h2>
          <span className="text-sm text-gray-500">· {C.linkedOf.replace("{a}", String(linked)).replace("{b}", String(lines.length))}</span>
          {editable && <button type="button" className="ms-auto text-sm text-[var(--brand)] underline" onClick={() => setLines((ls) => [...ls, { key: newKey(), supplier_code: "", description: "", variant_id: null, cartons: "", per_carton: "1", unit_price: "", carton_cbm: "" }])} data-testid="cn-add-line">{C.addLine}</button>}
        </div>
        {editable && (
          <div className="relative mx-5 mt-3 flex gap-2">
            <input className="input min-w-0 flex-1" placeholder={C.search} aria-label={C.search} value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(term, setHits); } }} />
            <button type="button" className="btn-ghost" onClick={() => void search(term, setHits)}>{C.add}</button>
            {hits && (
              <div className="absolute top-full z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[var(--line)] bg-white shadow-lg">
                {hits.length === 0 && <div className="px-4 py-3 text-sm text-gray-500">{t.stock.notFound}</div>}
                {hits.map((h) => <button key={h.variantId} type="button" className="flex w-full justify-between gap-3 px-4 py-2 text-start text-sm hover:bg-gray-50" onClick={() => void addItem(h)}><span>{h.name}{h.options && <span className="text-gray-500"> · {h.options}</span>}</span><span className="font-mono text-xs" dir="ltr">{h.sku}</span></button>)}
              </div>
            )}
          </div>
        )}
        {lines.length - linked > 0 && <p className="mx-5 mt-2 text-xs text-amber-700">{C.notLinked.replace("{n}", String(lines.length - linked))}</p>}
        <div className="mt-3 overflow-x-auto"><table className="table table-compact" data-testid="cn-lines">
          <thead><tr><th>{C.code} · {C.desc}</th><th>{C.cartons}</th><th>{C.price}</th><th>{C.cbm}</th><th>{C.landed}</th><th></th></tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const r = calc.rows[i];
              return (
                <tr key={l.key} data-code={l.supplier_code}>
                  <td className="cell-title">
                    <div className="flex gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {l.image_url ? <img src={l.image_url} alt="" className="h-12 w-12 shrink-0 rounded border border-[var(--line)] object-cover" /> : <div className="h-12 w-12 shrink-0 rounded border border-dashed border-[var(--line)]" />}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex gap-1">
                          <input className="input w-24 px-2 py-1.5 font-mono text-xs" dir="ltr" value={l.supplier_code} disabled={ro} aria-label={`${C.code} ${i + 1}`} onChange={(e) => setLine(l.key, { supplier_code: e.target.value })} />
                          <input className="input min-w-0 flex-1 px-2 py-1.5 text-sm" value={l.description} disabled={ro} aria-label={`${C.desc} ${i + 1}`} onChange={(e) => setLine(l.key, { description: e.target.value })} />
                        </div>
                        <div className="text-xs">
                          {l.variant_id
                            ? <><span className="text-emerald-700" dir="ltr">✓ {l.sku ?? ""}</span>{l.name && <span className="text-gray-500"> {l.name}</span>}{editable && <button type="button" className="ms-2 text-gray-500 underline" onClick={() => setLine(l.key, { variant_id: null, sku: null, name: null })}>{C.unlink}</button>}</>
                            : editable && (linking === l.key
                              ? <span className="relative inline-flex gap-1">
                                  <input autoFocus className="input w-44 px-2 py-1 text-xs" placeholder={C.search} value={linkTerm} aria-label={C.link} onChange={(e) => setLinkTerm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(linkTerm, setLinkHits); } }} />
                                  {linkHits && <span className="absolute top-full z-20 mt-1 max-h-56 w-72 overflow-y-auto rounded-lg border border-[var(--line)] bg-white shadow-lg">
                                    {linkHits.length === 0 && <span className="block px-3 py-2 text-gray-500">{t.stock.notFound}</span>}
                                    {linkHits.map((h) => <button key={h.variantId} type="button" className="block w-full px-3 py-1.5 text-start hover:bg-gray-50" onClick={() => void link(l.key, h)}>{h.name}{h.options ? ` · ${h.options}` : ""} <span className="font-mono" dir="ltr">{h.sku}</span></button>)}
                                  </span>}
                                </span>
                              : <button type="button" className="text-[var(--brand)] underline" onClick={() => { setLinking(l.key); setLinkTerm(l.supplier_code); setLinkHits(null); }}>🔗 {C.link}</button>)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td data-label={C.cartons}>
                    <div className="flex items-center gap-1">{input(l.cartons, (v) => setLine(l.key, { cartons: v }), `${C.cartons} ${i + 1}`, "w-16")}<span>×</span>{input(l.per_carton, (v) => setLine(l.key, { per_carton: v }), `pcs/ctn ${i + 1}`, "w-16", "numeric")}</div>
                    <div className="text-xs text-gray-500" dir="ltr">= {f0(r.qty)} {C.pieces}</div>
                  </td>
                  <td data-label={C.price}>{input(l.unit_price, (v) => setLine(l.key, { unit_price: v }), `${C.price} ${i + 1}`)} <span className="text-xs">¥</span><div className="text-xs text-gray-500" dir="ltr">= ¥{f2(r.cny)}</div></td>
                  <td data-label={C.cbm}>{input(l.carton_cbm, (v) => setLine(l.key, { carton_cbm: v }), `${C.cbm} ${i + 1}`)}<div className="text-xs text-gray-500" dir="ltr">= {Math.round(r.cbm * 1000) / 1000} CBM</div></td>
                  <td data-label={C.landed} dir="ltr"><div>{f2(r.line)}</div><div className="text-lg font-bold">{r.unit === null ? "—" : f2(r.unit)}</div><div className="text-xs text-gray-400">+ {f2(r.feesShare)}</div></td>
                  <td>{editable && <button type="button" className="text-gray-400 hover:text-red-600" aria-label={C.remove} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>×</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </section>
    </div>
  );
}
