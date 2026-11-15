"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict, Locale } from "@/i18n";
import { computeTotals, formatDecimal, formatSAR, rateToBp, toHalalas, toMilliQty } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { looksOffline } from "@/lib/offline";
import { useOfflineTill, type OfflineTill } from "./useOfflineTill";
import { OfflineBar, printTempReceipt } from "./OfflineBar";
import { searchVariantsAction, type VariantHit } from "@/app/actions/stock";
import {
  cashMovementAction, closeShiftAction, findCustomerAction, findInvoiceForReturnAction, loadQuotationAction, openShiftAction,
  postReturnAction, postSaleAction, quickAddCustomerAction, saveQuotationAction, type InvoiceForReturn, type PosCustomer,
} from "@/app/actions/pos";

type Line = { variantId: string; name: string; options: string; sku: string | null; qty: string; price: string; listPrice: string; discount: string };
type Method = { code: string; name: string; kind: string };
type Props = {
  t: Dict; locale: Locale; me: { id: string; name: string };
  locations: { id: string; name: string; code: string }[];
  company: string; canManageOffline: boolean;
  shift: { id: string; locationId: string; openedAt: string; openingCash: string } | null;
  methods: Method[]; people: { id: string; name: string }[]; vatRate: string;
  quotes: { no: number; total: string; at: string }[];
  can: { shift: boolean; sell: boolean; desk: boolean; collect: boolean; ret: boolean; discount: boolean; priceChange: boolean; cashOut: boolean; addCustomer: boolean };
  approval: { discount: boolean; ret: boolean; cashOut: boolean };
};

const uuid = () => crypto.randomUUID();
const safeH = (v: string) => { try { return toHalalas(v || "0"); } catch { return null; } };
const safeQ = (v: string) => { try { const q = toMilliQty(v || "0"); return q > 0n ? q : null; } catch { return null; } };

export function PosApp(p: Props) {
  const { t } = p;
  const router = useRouter();
  const tabs = ([["sell", p.can.sell], ["desk", p.can.desk], ["collect", p.can.collect], ["returns", p.can.ret]] as const).filter(([, ok]) => ok).map(([k]) => k);
  const [tab, setTab] = useState<(typeof tabs)[number]>(tabs[0] ?? "sell");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; href?: string } | null>(null);
  const err = (code: string) => (t.pos.errors as Record<string, string>)[code] ?? code;

  // ------------------------------------------------ no shift yet
  const [openLoc, setOpenLoc] = useState(p.locations[0]?.id ?? "");
  const [openingCash, setOpeningCash] = useState("0");
  const [busy, setBusy] = useState(false);
  if (!p.locations.length) return <p className="alert-err">{t.pos.noPosLocation}</p>;
  if (!p.shift) {
    return (
      <section className="card max-w-md space-y-4">
        <h2 className="card-title">{t.pos.openShift}</h2>
        {!p.can.shift && <p className="alert-err">{t.pos.errors.forbidden}</p>}
        <div><label className="label">{t.pos.location}</label>
          <select className="input" value={openLoc} onChange={(e) => setOpenLoc(e.target.value)}>{p.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        <div><label className="label">{t.pos.openingCash}</label><input className="input" dir="ltr" inputMode="decimal" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} /></div>
        {msg && <p className={msg.ok ? "alert-ok" : "alert-err"}>{msg.text}</p>}
        <button className="btn-primary w-full" disabled={busy || !p.can.shift} onClick={async () => {
          setBusy(true);
          const r = await openShiftAction({ clientId: uuid(), locationId: openLoc, openingCash });
          setBusy(false);
          if (r.ok) router.refresh(); else setMsg({ ok: false, text: err(r.error) });
        }}>{t.pos.openShift}</button>
      </section>
    );
  }
  return <ShiftView {...p} tab={tab} setTab={setTab} tabs={tabs} msg={msg} setMsg={setMsg} err={err} router={router} />;
}

function ShiftView(p: Props & { tab: string; setTab: (t: "sell" | "desk" | "collect" | "returns") => void; tabs: readonly ("sell" | "desk" | "collect" | "returns")[]; msg: { ok: boolean; text: string; href?: string } | null; setMsg: (m: { ok: boolean; text: string; href?: string } | null) => void; err: (c: string) => string; router: ReturnType<typeof useRouter> }) {
  const { t, locale, shift, router, err } = p;
  const s = shift!;
  const locName = p.locations.find((l) => l.id === s.locationId)?.name ?? "";
  const [panel, setPanel] = useState<"" | "cash" | "close">("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [cashKind, setCashKind] = useState<"cash_out" | "cash_in">("cash_out");
  const [mgr, setMgr] = useState({ u: "", p: "" });
  const [closeRes, setCloseRes] = useState<{ expected: string; difference: string } | null>(null);
  const cashId = useRef(uuid());
  const off = useOfflineTill({ locale, branchCode: p.locations.find((l) => l.id === s.locationId)?.code ?? "POS", shiftId: s.id });
  // Open on the screen chosen for this device (once, when its setting has been read).
  const screenApplied = useRef(false);
  useEffect(() => {
    if (!off.loaded || screenApplied.current) return;
    screenApplied.current = true;
    if (off.screen && p.tabs.includes(off.screen)) p.setTab(off.screen);
  }, [off.loaded, off.screen, p]);
  /** A server call that fails because there is no connection shows a clear message instead of doing nothing. */
  const tryOnline = async (fn: () => Promise<void>) => { try { await fn(); } catch (e) { p.setMsg({ ok: false, text: looksOffline(e) ? t.pos.offline.needsOnline : String(e) }); } };

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-gray-900">{locName}</div>
          <div className="text-xs text-gray-500">{t.pos.shiftOpen} {formatDateTime(new Date(s.openedAt), locale)} · {p.me.name}</div>
        </div>
        {p.can.cashOut && <button className="btn-ghost" onClick={() => setPanel(panel === "cash" ? "" : "cash")}>{t.pos.cashOut} / {t.pos.cashIn}</button>}
        {p.can.shift && <button className="btn-ghost" onClick={() => setPanel(panel === "close" ? "" : "close")}>{t.pos.closeShift}</button>}
      </div>

      <OfflineBar t={t} locale={locale} off={off} canManage={p.canManageOffline} err={err}
        screens={p.tabs.filter((k) => k !== "returns").map((k) => ({ key: k as "sell" | "desk" | "collect", label: k === "sell" ? t.pos.sell : k === "desk" ? t.pos.desk : t.pos.collect }))} />

      {panel === "cash" && (
        <section className="card grid gap-3 sm:grid-cols-2">
          <select className="input" value={cashKind} onChange={(e) => setCashKind(e.target.value as "cash_out" | "cash_in")}>
            <option value="cash_out">{t.pos.cashOut}</option><option value="cash_in">{t.pos.cashIn}</option>
          </select>
          <input className="input" dir="ltr" inputMode="decimal" placeholder={t.pos.amount} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className="input sm:col-span-2" placeholder={t.pos.reason} value={reason} onChange={(e) => setReason(e.target.value)} />
          {cashKind === "cash_out" && p.approval.cashOut && <Approval t={t} mgr={mgr} setMgr={setMgr} />}
          <button className="btn-primary sm:col-span-2" onClick={() => tryOnline(async () => {
            const r = await cashMovementAction({ clientId: cashId.current, shiftId: s.id, kind: cashKind, amount, reason, approverUsername: mgr.u, approverPin: mgr.p });
            if (r.ok) { cashId.current = uuid(); setAmount(""); setReason(""); setMgr({ u: "", p: "" }); setPanel(""); p.setMsg({ ok: true, text: t.saved }); }
            else p.setMsg({ ok: false, text: err(r.error) });
          })}>{t.save}</button>
        </section>
      )}
      {panel === "close" && (
        <section className="card grid gap-3 sm:grid-cols-2">
          <input className="input" dir="ltr" inputMode="decimal" placeholder={t.pos.countedCash} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className="btn-primary" onClick={() => tryOnline(async () => {
            if (off.pendingFor(s.id) > 0) return p.setMsg({ ok: false, text: t.pos.offline.closeBlocked });
            const r = await closeShiftAction({ shiftId: s.id, counted: amount });
            if (r.ok) setCloseRes({ expected: r.expected, difference: r.difference }); else p.setMsg({ ok: false, text: err(r.error) });
          })}>{t.pos.closeShift}</button>
          {closeRes && (
            <div className="alert-ok sm:col-span-2">
              {t.pos.shiftClosed}: {t.pos.expected} {closeRes.expected} · {t.pos.difference} {closeRes.difference}
              <button className="ms-3 underline" onClick={() => router.refresh()}>OK</button>
            </div>
          )}
        </section>
      )}

      {p.msg && (
        <p className={p.msg.ok ? "alert-ok" : "alert-err"}>
          {p.msg.text}{p.msg.href && <a href={p.msg.href} target="_blank" rel="noopener" className="ms-3 font-semibold underline">{t.pos.printReceipt}</a>}
        </p>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {p.tabs.map((k) => (
          <button key={k} onClick={() => { p.setTab(k); p.setMsg(null); }} className={`rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap ${p.tab === k ? "bg-[var(--brand)] text-white" : "border border-[var(--line)] bg-white text-gray-700"}`}>
            {k === "sell" ? t.pos.sell : k === "desk" ? t.pos.desk : k === "collect" ? t.pos.collect : t.pos.returns}
          </button>
        ))}
      </div>

      {(p.tab === "sell" || p.tab === "desk") && <SaleView key={p.tab} {...p} mode={p.tab} off={off} />}
      {p.tab === "collect" && <SaleView key="collect" {...p} mode="collect" off={off} />}
      {p.tab === "returns" && <ReturnView {...p} />}
    </div>
  );
}

function Approval({ t, mgr, setMgr }: { t: Dict; mgr: { u: string; p: string }; setMgr: (m: { u: string; p: string }) => void }) {
  return (
    <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 sm:col-span-2 sm:grid-cols-2">
      <div className="text-sm font-medium text-amber-900 sm:col-span-2">{t.approval.title}</div>
      <input className="input" dir="ltr" autoCapitalize="none" placeholder={t.approval.username} value={mgr.u} onChange={(e) => setMgr({ ...mgr, u: e.target.value })} />
      <input className="input" dir="ltr" type="password" inputMode="numeric" placeholder={t.approval.pin} value={mgr.p} onChange={(e) => setMgr({ ...mgr, p: e.target.value })} />
    </div>
  );
}

function ItemSearch({ t, locale, onPick, off }: { t: Dict; locale: Locale; onPick: (h: VariantHit) => void; off?: OfflineTill }) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<VariantHit[] | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const pick = (h: VariantHit) => { onPick(h); setTerm(""); setHits(null); ref.current?.focus(); };
  return (
    <div className="relative">
      <input ref={ref} autoFocus className="input" placeholder={t.pos.scan} value={term} onChange={(e) => setTerm(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          let r: VariantHit[];
          if (off?.enabled && !navigator.onLine) r = off.searchLocal(term);
          else {
            try { r = await searchVariantsAction(term, locale); }
            catch { r = off?.enabled ? off.searchLocal(term) : []; }
          }
          if (r.length === 1 || r[0]?.exact) pick(r[0]); else setHits(r);
        }} />
      {hits && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-[var(--line)] bg-white shadow-lg">
          {hits.length === 0 && <div className="px-4 py-3 text-sm text-gray-500">{t.stock.notFound}</div>}
          {hits.map((h) => (
            <button key={h.variantId} type="button" onClick={() => pick(h)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start text-sm hover:bg-gray-50">
              <span><span className="font-medium">{h.name}</span>{h.options && <span className="text-gray-500"> · {h.options}</span>}</span>
              <span className="text-xs text-gray-500" dir="ltr">{h.sku ?? ""} · {h.price}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SaleView(p: Props & { mode: "sell" | "desk" | "collect"; off: OfflineTill; setMsg: (m: { ok: boolean; text: string; href?: string } | null) => void; err: (c: string) => string; router: ReturnType<typeof useRouter> }) {
  const { t, locale, mode, err } = p;
  const s = p.shift!;
  const [lines, setLines] = useState<Line[]>([]);
  const [customer, setCustomer] = useState<PosCustomer | null>(null);
  const [phone, setPhone] = useState("");
  const [custName, setCustName] = useState("");
  const [custNotFound, setCustNotFound] = useState(false);
  const [salesperson, setSalesperson] = useState(p.me.id);
  const [payments, setPayments] = useState<{ method: string; amount: string }[]>([]);
  const [cashGiven, setCashGiven] = useState("");
  const [mgr, setMgr] = useState({ u: "", p: "" });
  const [quoteNo, setQuoteNo] = useState("");
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clientId = useRef(uuid());
  const locked = mode === "collect";

  const totals = useMemo(() => {
    try {
      const ls = lines.map((l) => {
        const q = safeQ(l.qty), u = safeH(l.price), d = safeH(l.discount);
        if (q === null || u === null || d === null) throw new Error("bad");
        return { unitPriceIncl: u, qtyMilli: q, discount: d };
      });
      return computeTotals(ls, rateToBp(p.vatRate));
    } catch { return null; }
  }, [lines, p.vatRate]);
  const totalH = totals?.gross ?? 0n;
  const paidH = payments.reduce((a, x) => a + (safeH(x.amount) ?? 0n), 0n);
  const cashPartH = payments.filter((x) => p.methods.find((m) => m.code === x.method)?.kind === "cash").reduce((a, x) => a + (safeH(x.amount) ?? 0n), 0n);
  const changeH = cashGiven ? (safeH(cashGiven) ?? 0n) - cashPartH : 0n;
  const changed = lines.some((l) => (safeH(l.discount) ?? 0n) > 0n || l.price !== l.listPrice);
  const pays = payments.length ? payments : [{ method: p.methods[0]?.code ?? "cash", amount: totals ? formatDecimal(totalH) : "" }];

  function add(h: VariantHit) {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.variantId === h.variantId);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: String(Number(l.qty) + 1) } : l));
      return [...ls, { variantId: h.variantId, name: h.name, options: h.options, sku: h.sku, qty: "1", price: h.price, listPrice: h.price, discount: "0" }];
    });
    setPayments([]);
  }
  function reset() { setLines([]); setCustomer(null); setPhone(""); setCustName(""); setPayments([]); setCashGiven(""); setMgr({ u: "", p: "" }); setQuoteId(null); setQuoteNo(""); clientId.current = uuid(); }

  /** No connection: keep the sale on this device with a temporary number; it is sent automatically later. */
  function saveOffline(cart: { variantId: string; qty: string; unitPrice: string; discount: string }[]) {
    const o = t.pos.offline;
    if (!p.off.enabled || mode !== "sell") return p.setMsg({ ok: false, text: p.off.enabled ? o.needsOnline : o.notEnabled });
    if (changed && p.approval.discount) return p.setMsg({ ok: false, text: o.noApprovalOffline });
    if (pays.some((x) => p.methods.find((m) => m.code === x.method)?.kind === "on_account")) return p.setMsg({ ok: false, text: o.noAccountOffline });
    const sale = p.off.save({
      clientId: clientId.current, createdAt: new Date().toISOString(), locationId: s.locationId, shiftId: s.id, total: formatDecimal(totalH),
      payload: { salespersonId: salesperson, customerId: customer?.id, lines: cart, payments: pays, cashTendered: cashGiven || undefined },
      lines: lines.map((l) => ({ name: l.options ? `${l.name} - ${l.options}` : l.name, qty: l.qty, price: l.price, discount: l.discount })),
    });
    const branch = p.locations.find((l) => l.id === s.locationId)?.name ?? "";
    p.setMsg({ ok: true, text: `${o.savedOffline} ${sale.tempNo}${cashGiven && changeH > 0n ? ` · ${t.pos.change}: ${formatDecimal(changeH)}` : ""}` });
    printTempReceipt(sale, { t, locale, company: p.company, branch });
    reset();
  }

  async function submit() {
    setBusy(true);
    p.setMsg(null);
    const cart = lines.map((l) => ({ variantId: l.variantId, qty: l.qty, unitPrice: l.price, discount: l.discount }));
    if (mode === "sell" && p.off.enabled && !navigator.onLine) { setBusy(false); return saveOffline(cart); }
    try { await submitOnline(cart); } catch (e) {
      if (looksOffline(e)) saveOffline(cart); else p.setMsg({ ok: false, text: String(e) });
    } finally { setBusy(false); }
  }

  async function submitOnline(cart: { variantId: string; qty: string; unitPrice: string; discount: string }[]) {
    if (mode === "desk") {
      const r = await saveQuotationAction({ clientId: clientId.current, locationId: s.locationId, salespersonId: salesperson, customerId: customer?.id, lines: cart, approverUsername: mgr.u, approverPin: mgr.p });
      setBusy(false);
      if (r.ok) { p.setMsg({ ok: true, text: `${t.pos.quoteSaved} ${r.quoteNo}` }); reset(); p.router.refresh(); } else p.setMsg({ ok: false, text: err(r.error) });
      return;
    }
    const r = await postSaleAction({
      clientId: clientId.current, locationId: s.locationId, shiftId: s.id, salespersonId: salesperson, customerId: customer?.id,
      quotationId: quoteId ?? undefined, lines: cart, payments: pays, cashTendered: cashGiven || undefined, approverUsername: mgr.u, approverPin: mgr.p,
    });
    setBusy(false);
    if (r.ok) {
      p.setMsg({ ok: true, text: `${t.pos.done} ${r.number}${r.change !== "0.00" ? ` · ${t.pos.change}: ${r.change}` : ""}`, href: `/sales/${r.invoiceId}?print=1` });
      reset();
      p.router.refresh();
    } else p.setMsg({ ok: false, text: err(r.error) });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <section className="card space-y-3">
        {mode === "collect" ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input className="input" dir="ltr" inputMode="numeric" placeholder={t.pos.quoteNo} value={quoteNo} onChange={(e) => setQuoteNo(e.target.value)} />
              <button className="btn-ghost" onClick={async () => {
                const r = await loadQuotationAction(Number(quoteNo), locale);
                if (!r.ok) return p.setMsg({ ok: false, text: err(r.error) });
                setQuoteId(r.quote.id);
                setLines(r.quote.lines.map((l) => ({ ...l, price: l.unitPrice, listPrice: l.unitPrice })));
                if (r.quote.salespersonId) setSalesperson(r.quote.salespersonId);
                setPayments([]);
              }}>{t.pos.loadQuote}</button>
            </div>
            {!quoteId && (
              <div className="text-sm">
                <div className="mb-1 font-medium text-gray-700">{t.pos.openQuotes}</div>
                {p.quotes.length === 0 ? <p className="text-gray-500">{t.pos.noQuotes}</p> : (
                  <div className="flex flex-wrap gap-2">
                    {p.quotes.map((q) => <button key={q.no} className="btn-ghost" onClick={() => setQuoteNo(String(q.no))}>#{q.no} · {q.total}</button>)}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <ItemSearch t={t} locale={locale} onPick={add} off={p.off} />
        )}
        {lines.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">{t.pos.cartEmpty}</p> : (
          <table className="table">
            <thead><tr><th>{t.stock.item}</th><th>{t.pos.qty}</th><th>{t.pos.price}</th>{p.can.discount && <th>{t.pos.discount}</th>}<th></th></tr></thead>
            <tbody>
              {lines.map((l, i) => {
                const set = (patch: Partial<Line>) => { setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x))); setPayments([]); };
                return (
                  <tr key={l.variantId}>
                    <td className="cell-title">{l.name}{(l.options || l.sku) && <div className="text-xs text-gray-500">{l.options} <span dir="ltr">{l.sku ?? ""}</span></div>}</td>
                    <td data-label={t.pos.qty}><input className="input w-20" dir="ltr" inputMode="decimal" value={l.qty} disabled={locked} onChange={(e) => set({ qty: e.target.value })} /></td>
                    <td data-label={t.pos.price}><input className="input w-24" dir="ltr" inputMode="decimal" value={l.price} disabled={locked || !p.can.priceChange} onChange={(e) => set({ price: e.target.value })} /></td>
                    {p.can.discount && <td data-label={t.pos.discount}><input className="input w-20" dir="ltr" inputMode="decimal" value={l.discount} disabled={locked} onChange={(e) => set({ discount: e.target.value })} /></td>}
                    <td>{!locked && <button className="text-sm text-red-600 hover:underline" onClick={() => { setLines((ls) => ls.filter((_, j) => j !== i)); setPayments([]); }}>{t.stock.remove}</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <aside className="space-y-4">
        <section className="card space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">{t.pos.net}</span><span dir="ltr">{totals ? formatSAR(totals.net, locale) : "—"}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">{t.pos.vat} ({p.vatRate}%)</span><span dir="ltr">{totals ? formatSAR(totals.vat, locale) : "—"}</span></div>
          <div className="flex justify-between border-t border-[var(--line)] pt-2 text-lg font-semibold"><span>{t.pos.total}</span><span dir="ltr">{totals ? formatSAR(totalH, locale) : "—"}</span></div>
        </section>

        <section className="card space-y-2">
          <label className="label">{t.pos.customer}</label>
          {customer ? (
            <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
              <span><b>{customer.name || "—"}</b> · <span dir="ltr">{customer.phone}</span> · #{customer.customerNo}</span>
              {!locked && <button className="text-red-600" onClick={() => setCustomer(null)}>×</button>}
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input className="input" dir="ltr" inputMode="tel" placeholder={t.pos.customerPhone} value={phone} onChange={(e) => { setPhone(e.target.value); setCustNotFound(false); }} />
                <button className="btn-ghost" onClick={async () => {
                  const r = await findCustomerAction(phone);
                  if (!r.ok) return p.setMsg({ ok: false, text: err(r.error) });
                  if (r.customer) setCustomer(r.customer); else setCustNotFound(true);
                }}>{t.pos.findCustomer}</button>
              </div>
              {custNotFound && p.can.addCustomer && (
                <div className="flex gap-2">
                  <input className="input" placeholder={t.pos.customerName} value={custName} onChange={(e) => setCustName(e.target.value)} />
                  <button className="btn-ghost" onClick={async () => {
                    const r = await quickAddCustomerAction(phone, custName);
                    if (r.ok) setCustomer(r.customer); else p.setMsg({ ok: false, text: err(r.error) });
                  }}>{t.pos.addCustomer}</button>
                </div>
              )}
              <p className="hint">{t.pos.walkIn}</p>
            </>
          )}
          <label className="label pt-2">{t.pos.salesperson}</label>
          <select className="input" value={salesperson} onChange={(e) => setSalesperson(e.target.value)}>{p.people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        </section>

        {mode !== "desk" && lines.length > 0 && (
          <section className="card space-y-2">
            <div className="flex items-center justify-between"><span className="label mb-0">{t.pos.payments}</span>
              <button className="text-sm text-[var(--brand)] underline" onClick={() => setPayments([...pays, { method: p.methods.find((m) => m.kind !== "cash")?.code ?? pays[0].method, amount: "" }])}>{t.pos.addPayment}</button></div>
            {pays.map((x, i) => (
              <div key={i} className="flex gap-2">
                <select className="input" value={x.method} onChange={(e) => setPayments(pays.map((y, j) => (j === i ? { ...y, method: e.target.value } : y)))}>
                  {p.methods.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
                </select>
                <input className="input w-28" dir="ltr" inputMode="decimal" value={x.amount} onChange={(e) => setPayments(pays.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))} />
              </div>
            ))}
            {pays.some((x) => p.methods.find((m) => m.code === x.method)?.kind === "cash") && (
              <div><label className="label">{t.pos.cashGiven}</label><input className="input" dir="ltr" inputMode="decimal" value={cashGiven} onChange={(e) => setCashGiven(e.target.value)} /></div>
            )}
            {payments.length > 0 && paidH !== totalH && <p className="text-sm text-red-600">{t.pos.remaining}: {formatSAR(totalH - paidH, locale)}</p>}
            {cashGiven && changeH >= 0n && <p className="text-lg font-semibold text-emerald-700">{t.pos.change}: {formatSAR(changeH, locale)}</p>}
          </section>
        )}

        {changed && p.approval.discount && !locked && <section className="card"><Approval t={t} mgr={mgr} setMgr={setMgr} /></section>}

        <button className="btn-primary w-full py-3 text-base" disabled={busy || !lines.length || !totals || (mode !== "desk" && payments.length > 0 && paidH !== totalH)} onClick={submit}>
          {busy ? t.pos.paying : mode === "desk" ? t.pos.saveQuote : `${t.pos.pay} ${totals ? formatSAR(totalH, locale) : ""}`}
        </button>
      </aside>
    </div>
  );
}

function ReturnView(p: Props & { setMsg: (m: { ok: boolean; text: string; href?: string } | null) => void; err: (c: string) => string; router: ReturnType<typeof useRouter> }) {
  const { t, locale, err } = p;
  const s = p.shift!;
  const [number, setNumber] = useState("");
  const [inv, setInv] = useState<InvoiceForReturn | null>(null);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [noReceipt, setNoReceipt] = useState(false);
  const [items, setItems] = useState<{ variantId: string; name: string; qty: string; price: string }[]>([]);
  const [method, setMethod] = useState(p.methods[0]?.code ?? "cash");
  const [reason, setReason] = useState("");
  const [mgr, setMgr] = useState({ u: "", p: "" });
  const [busy, setBusy] = useState(false);
  const clientId = useRef(uuid());

  async function submit() {
    setBusy(true);
    const lines = noReceipt
      ? items.map((i) => ({ variantId: i.variantId, qty: i.qty }))
      : Object.entries(qty).filter(([, q]) => Number(q) > 0).map(([lineNo, q]) => ({ lineNo: Number(lineNo), qty: q }));
    const r = await postReturnAction({ clientId: clientId.current, locationId: s.locationId, shiftId: s.id, originalInvoiceId: noReceipt ? undefined : inv?.id, customerId: inv?.customerId ?? undefined, reason, lines, refundMethod: method, approverUsername: mgr.u, approverPin: mgr.p });
    setBusy(false);
    if (r.ok) {
      p.setMsg({ ok: true, text: `${t.pos.returnDone} ${r.number} · ${t.pos.refund} ${r.total}`, href: `/sales/${r.invoiceId}?print=1` });
      setInv(null); setQty({}); setItems([]); setNumber(""); setReason(""); setMgr({ u: "", p: "" }); clientId.current = uuid();
    } else p.setMsg({ ok: false, text: err(r.error) });
  }

  return (
    <section className="card space-y-4">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={noReceipt} onChange={(e) => { setNoReceipt(e.target.checked); setInv(null); }} className="h-4 w-4 accent-[var(--brand)]" /> {t.pos.noReceipt}</label>
      {!noReceipt ? (
        <>
          <div className="flex gap-2">
            <input className="input" dir="ltr" placeholder={t.pos.invoiceNo} value={number} onChange={(e) => setNumber(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget.nextElementSibling as HTMLButtonElement)?.click(); }} />
            <button className="btn-ghost" onClick={async () => {
              const r = await findInvoiceForReturnAction(number);
              if (r.ok) { setInv(r.invoice); setQty({}); } else p.setMsg({ ok: false, text: err(r.error) });
            }}>{t.pos.find}</button>
          </div>
          {inv && (
            <table className="table">
              <thead><tr><th>{t.stock.item}</th><th>{t.pos.returnable}</th><th>{t.pos.returnQty}</th></tr></thead>
              <tbody>
                {inv.lines.map((l) => (
                  <tr key={l.lineNo}>
                    <td className="cell-title">{l.name}<div className="text-xs text-gray-500" dir="ltr">{l.sku ?? ""} · {l.gross}</div></td>
                    <td data-label={t.pos.returnable}>{Number(l.returnable)}</td>
                    <td data-label={t.pos.returnQty}><input className="input w-20" dir="ltr" inputMode="decimal" disabled={Number(l.returnable) <= 0} value={qty[l.lineNo] ?? ""} onChange={(e) => setQty({ ...qty, [l.lineNo]: e.target.value })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <>
          <ItemSearch t={t} locale={locale} onPick={(h) => setItems((xs) => (xs.some((x) => x.variantId === h.variantId) ? xs : [...xs, { variantId: h.variantId, name: h.name, qty: "1", price: h.price }]))} />
          {items.map((i, k) => (
            <div key={i.variantId} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{i.name} · {i.price}</span>
              <input className="input w-20" dir="ltr" inputMode="decimal" value={i.qty} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, qty: e.target.value } : x)))} />
            </div>
          ))}
        </>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">{t.pos.refundMethod}</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{p.methods.filter((m) => m.kind !== "on_account").map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</select></div>
        <div><label className="label">{t.pos.reason}</label><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        {p.approval.ret && <Approval t={t} mgr={mgr} setMgr={setMgr} />}
      </div>
      <button className="btn-primary w-full" disabled={busy || (noReceipt ? !items.length : !inv)} onClick={submit}>{busy ? t.pos.paying : t.pos.refund}</button>
    </section>
  );
}
