"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict, Locale } from "@/i18n";
import { computeTotals, formatDecimal, formatSAR, rateToBp, toHalalas, toMilliQty } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { decodeQuoteQr, looksOffline, noReceiptAmount, returnLineAmount, sumAmounts, type QrLine } from "@/lib/offline";
import { useOfflineTill, type OfflineTill } from "./useOfflineTill";
import { OfflineBar, printTempQuote, printTempReceipt, printTempReturn } from "./OfflineBar";
import { CameraScan } from "./CameraScan";
import { Icon, type IconName } from "../icons";
import { searchVariantsAction, type VariantHit } from "@/app/actions/stock";
import {
  cashMovementAction, closeShiftAction, findInvoiceForReturnAction, loadQuotationAction, openShiftAction,
  postReturnAction, postSaleAction, quickAddCustomerAction, quoteNoForTempAction, saveQuotationAction, searchCustomersAction, updateQuotationAction,
  cancelQuotationAction, type DrawerKind, type InvoiceForReturn, type PosCustomer,
} from "@/app/actions/pos";

type Line = { variantId: string; name: string; options: string; sku: string | null; qty: string; price: string; listPrice: string; discount: string; usual?: boolean };

/** The customer's usual discount for one line, same rounding as the server (down to the halala). */
function usualDiscount(price: string, qty: string, pct: number | undefined): string {
  if (!pct) return "0";
  try { return formatDecimal((toHalalas(price) * toMilliQty(qty || "0") * BigInt(Math.round(pct * 100))) / 10_000_000n); } catch { return "0"; }
}
type Method = { code: string; name: string; kind: string };
type Props = {
  t: Dict; locale: Locale; me: { id: string; name: string };
  locations: { id: string; name: string; code: string }[];
  company: string; canManageOffline: boolean;
  /** tile names in the other language (shown small under each tile) */
  otherTiles: Dict["pos"]["tiles"];
  expenseTypes: { id: string; name: string }[];
  shift: { id: string; locationId: string; openedAt: string; openingCash: string } | null;
  methods: Method[]; people: { id: string; name: string }[]; vatRate: string;
  quotes: { no: number; total: string; at: string }[];
  can: { shift: boolean; sell: boolean; desk: boolean; collect: boolean; ret: boolean; retNoReceipt: boolean; skipCustomer: boolean; discount: boolean; priceChange: boolean; cashOut: boolean; addCustomer: boolean };
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
  // the cashier's start screen is a set of big tiles; a tile opens that screen ("home" = the tiles)
  const [view, setView] = useState<"home" | "sale" | "cash" | "close">("home");
  const panel = view === "cash" || view === "close" ? view : "";
  const setPanel = (v: "" | "cash" | "close") => setView(v || "sale");
  const open = (k: "sell" | "desk" | "collect" | "returns" | "cash" | "close") => {
    p.setMsg(null);
    if (k === "cash" || k === "close") return setView(k);
    p.setTab(k); setView("sale");
  };
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [cashKind, setCashKind] = useState<DrawerKind>("cash_out");
  const [expenseType, setExpenseType] = useState("");
  const [payCustomer, setPayCustomer] = useState<PosCustomer | null>(null);
  const [payMethod, setPayMethod] = useState(p.methods.find((m) => m.kind === "cash")?.code ?? "cash");
  const [mgr, setMgr] = useState({ u: "", p: "" });
  const [closeRes, setCloseRes] = useState<{ expected: string; difference: string } | null>(null);
  const cashId = useRef(uuid());
  const off = useOfflineTill({ locale, branchCode: p.locations.find((l) => l.id === s.locationId)?.code ?? "POS", shiftId: s.id, locationId: s.locationId, canReturn: p.can.ret });
  // Open on the screen chosen for this device (once, when its setting has been read).
  const screenApplied = useRef(false);
  useEffect(() => {
    if (!off.loaded || screenApplied.current) return;
    screenApplied.current = true;
    const k = off.screen;
    if (k && p.tabs.includes(k)) queueMicrotask(() => { p.setTab(k); setView("sale"); });
  }, [off.loaded, off.screen, p]);
  /** A server call that fails because there is no connection shows a clear message instead of doing nothing. */
  const tryOnline = async (fn: () => Promise<void>, whenOffline?: () => void) => {
    try { await fn(); } catch (e) {
      if (looksOffline(e) && whenOffline) return whenOffline();
      p.setMsg({ ok: false, text: looksOffline(e) ? t.pos.offline.needsOnline : String(e) });
    }
  };

  const T = t.pos.tiles, O = p.otherTiles;
  const tiles: { key: "sell" | "desk" | "collect" | "returns" | "cash" | "close"; icon: IconName; label: string; other: string; chip: string }[] = [
    ...p.tabs.map((k) => ({
      key: k, icon: (k === "sell" ? "receipt" : k === "desk" ? "quote" : k === "collect" ? "cash" : "undo") as IconName,
      label: T[k], other: O[k], chip: k === "sell" ? t.pos.sell : k === "desk" ? t.pos.desk : k === "collect" ? t.pos.collect : t.pos.returns,
    })),
    ...(p.can.cashOut || p.can.collect || p.can.shift ? [{ key: "cash" as const, icon: "drawer" as IconName, label: T.cash, other: O.cash, chip: t.pos.extra.drawer }] : []),
    ...(p.can.shift ? [{ key: "close" as const, icon: "card" as IconName, label: T.close, other: O.close, chip: t.pos.closeShift }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-gray-900">{locName}</div>
          <div className="text-xs text-gray-500">{t.pos.shiftOpen} {formatDateTime(new Date(s.openedAt), locale)} · {p.me.name}</div>
        </div>
        <a href={`/pos/shifts/${s.id}`} className="btn-ghost">{t.pos.extra.shiftReport}</a>
      </div>

      <OfflineBar t={t} locale={locale} off={off} canManage={p.canManageOffline} err={err}
        screens={p.tabs.filter((k) => k !== "returns").map((k) => ({ key: k as "sell" | "desk" | "collect", label: k === "sell" ? t.pos.sell : k === "desk" ? t.pos.desk : t.pos.collect }))} />

      {panel === "cash" && (
        <section className="card grid gap-3 sm:grid-cols-2">
          <select className="input" value={cashKind} onChange={(e) => setCashKind(e.target.value as DrawerKind)}>
            {p.can.cashOut && <option value="cash_out">{t.pos.cashOut}</option>}
            {p.can.cashOut && <option value="cash_in">{t.pos.cashIn}</option>}
            <option value="expense">{t.pos.extra.expense}</option>
            <option value="customer_payment">{t.pos.extra.customerPayment}</option>
          </select>
          <input className="input" dir="ltr" inputMode="decimal" placeholder={t.pos.amount} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className="input sm:col-span-2" placeholder={t.pos.reason} value={reason} onChange={(e) => setReason(e.target.value)} />
          {cashKind === "expense" && (
            <select className="input sm:col-span-2" value={expenseType} onChange={(e) => setExpenseType(e.target.value)}>
              <option value="">{t.pos.extra.expenseType}</option>
              {p.expenseTypes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
          {cashKind === "customer_payment" && (
            <>
              <div className="sm:col-span-2"><CustomerPicker t={t} value={payCustomer} onPick={setPayCustomer} err={err} setMsg={p.setMsg} off={off} /></div>
              <select className="input sm:col-span-2" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                {p.methods.filter((m) => m.kind !== "on_account").map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
              </select>
            </>
          )}
          {((cashKind === "cash_out" && p.approval.cashOut) || ((cashKind === "cash_in" || cashKind === "expense") && p.approval.discount)) && <Approval t={t} mgr={mgr} setMgr={setMgr} />}
          <button className="btn-primary sm:col-span-2" onClick={() => {
            const needsPin = (cashKind === "cash_out" && p.approval.cashOut) || ((cashKind === "cash_in" || cashKind === "expense") && p.approval.discount);
            const offline = () => {
              if (!off.enabled) return p.setMsg({ ok: false, text: t.pos.offline.notEnabled });
              if (needsPin) return p.setMsg({ ok: false, text: t.pos.offline.noApprovalOffline });
              if (!/^\d{1,9}(\.\d{1,2})?$/.test(amount.trim()) || Number(amount) <= 0) return p.setMsg({ ok: false, text: err("bad_amount") });
              if (cashKind === "expense" && !expenseType) return p.setMsg({ ok: false, text: err("expense_type_required") });
              if (cashKind === "customer_payment" && !payCustomer) return p.setMsg({ ok: false, text: err("customer_required") });
              off.saveDrawer({ clientId: cashId.current, label: `${amount}`, payload: { kind: cashKind, amount: amount.trim(), reason, expenseTypeId: expenseType || undefined, customerId: payCustomer?.id, method: payMethod } });
              cashId.current = uuid(); setAmount(""); setReason(""); setExpenseType(""); setPayCustomer(null); setPanel("");
              p.setMsg({ ok: true, text: t.pos.offline.savedOfflineDrawer });
            };
            if (!off.online) return offline();
            return tryOnline(async () => {
            const r = await cashMovementAction({ clientId: cashId.current, shiftId: s.id, kind: cashKind, amount, reason, expenseTypeId: expenseType, customerId: payCustomer?.id, method: payMethod, approverUsername: mgr.u, approverPin: mgr.p });
            if (r.ok) { cashId.current = uuid(); setAmount(""); setReason(""); setExpenseType(""); setPayCustomer(null); setMgr({ u: "", p: "" }); setPanel(""); p.setMsg({ ok: true, text: t.saved }); }
            else p.setMsg({ ok: false, text: err(r.error) });
          }, offline);
          }}>{t.save}</button>
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

      {view === "home" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3" data-testid="pos-tiles">
          {tiles.map((x, i) => (
            <button key={x.key} data-tile={x.key} onClick={() => open(x.key)}
              className={`flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl border p-4 text-center shadow-sm transition sm:min-h-40 ${i === 0 ? "border-[var(--brand)] bg-[var(--brand)] text-white hover:opacity-95" : "border-[var(--line)] bg-white text-gray-900 hover:border-[var(--brand)]"}`}>
              <Icon name={x.icon} className="h-9 w-9 sm:h-11 sm:w-11" />
              <span className="text-lg font-bold leading-tight sm:text-2xl">{x.label}</span>
              <span className={`text-sm sm:text-base ${i === 0 ? "text-white/85" : "text-gray-500"}`} lang={locale === "ar" ? "en" : "ar"}>{x.other}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <button onClick={() => { setView("home"); p.setMsg(null); }} data-testid="tiles-back" className="flex items-center gap-1 rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-sm font-medium text-gray-700">
            <Icon name="back" className="h-4 w-4 rtl:rotate-180" />{t.pos.tiles.back}
          </button>
          {tiles.map((x) => {
            const on = (view === "sale" && p.tab === x.key) || view === x.key;
            return (
              <button key={x.key} onClick={() => open(x.key)} className={`rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap ${on ? "bg-[var(--brand)] text-white" : "border border-[var(--line)] bg-white text-gray-700"}`}>
                {x.chip}
              </button>
            );
          })}
        </div>
      )}

      {view === "sale" && (p.tab === "sell" || p.tab === "desk") && <SaleView key={p.tab} {...p} mode={p.tab} off={off} />}
      {view === "sale" && p.tab === "collect" && <SaleView key="collect" {...p} mode="collect" off={off} />}
      {view === "sale" && p.tab === "returns" && <ReturnView {...p} off={off} />}
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

/** Customer by mobile, name or serial number; shows usual discount and balance. */
/** Customer search: online, or the copy kept on this device when there is no connection. */
async function findCustomers(term: string, off?: OfflineTill): Promise<{ ok: true; customers: PosCustomer[] } | { ok: false; error: string }> {
  if (off && !off.online) return { ok: true, customers: off.searchCustomersLocal(term) };
  try { return await searchCustomersAction(term); }
  catch (e) { if (off && looksOffline(e)) return { ok: true, customers: off.searchCustomersLocal(term) }; throw e; }
}

function CustomerPicker({ t, value, onPick, err, setMsg, disabled, off }: { t: Dict; value: PosCustomer | null; onPick: (c: PosCustomer | null) => void; err: (c: string) => string; setMsg: (m: { ok: boolean; text: string } | null) => void; disabled?: boolean; off?: OfflineTill }) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<PosCustomer[] | null>(null);
  const X = t.pos.extra;
  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm" data-testid="customer">
        <span><b>{value.name || "—"}</b> · <span dir="ltr">{value.phone}</span> · #{value.customerNo}
          {!!value.discountPct && <span className="badge-blue ms-2">{X.usualDiscount} {value.discountPct}%</span>}
          {value.balance !== undefined && Number(value.balance) !== 0 && <span className="badge-gray ms-2">{X.balance} {value.balance}</span>}
          <span className="ms-2 text-xs text-gray-500">{X.creditLimit}: {value.creditLimit ?? X.noLimit}</span></span>
        {!disabled && <button className="text-red-600" onClick={() => onPick(null)}>×</button>}
      </div>
    );
  }
  return (
    <div className="relative">
      <div className="flex gap-2">
        <input className="input" placeholder={X.searchCustomer} value={term} onChange={(e) => setTerm(e.target.value)} disabled={disabled}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.currentTarget.nextSibling as HTMLButtonElement)?.click(); } }} />
        <button type="button" className="btn-ghost" disabled={disabled} onClick={async () => {
          const r = await findCustomers(term, off);
          if (!r.ok) return setMsg({ ok: false, text: err(r.error) });
          if (r.customers.length === 1) { onPick(r.customers[0]); setTerm(""); setHits(null); } else setHits(r.customers);
        }}>{t.pos.findCustomer}</button>
      </div>
      {hits && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-[var(--line)] bg-white shadow-lg">
          {hits.length === 0 && <div className="px-4 py-3 text-sm text-gray-500">{t.stock.notFound}</div>}
          {hits.map((c) => <button key={c.id} type="button" onClick={() => { onPick(c); setTerm(""); setHits(null); }} className="block w-full px-4 py-2 text-start text-sm hover:bg-gray-50">{c.name} · <span dir="ltr">{c.phone}</span> · #{c.customerNo}</button>)}
        </div>
      )}
    </div>
  );
}

function ItemSearch({ t, locale, onPick, off, onSlip }: { t: Dict; locale: Locale; onPick: (h: VariantHit) => void; off?: OfflineTill; onSlip?: (text: string) => void }) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<VariantHit[] | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const pick = (h: VariantHit) => { onPick(h); setTerm(""); setHits(null); };
  const run = async (q: string) => {
    if (onSlip && (decodeQuoteQr(q) || /^OFF-[A-Za-z0-9-]+-Q\d+$/.test(q.trim()))) { setTerm(""); setHits(null); return onSlip(q); }
    let r: VariantHit[];
    if (off?.enabled && !off.online) r = off.searchLocal(q);
    else {
      try { r = await searchVariantsAction(q, locale); }
      catch { r = off?.enabled ? off.searchLocal(q) : []; }
    }
    if (r.length === 1 || r[0]?.exact) pick(r[0]); else setHits(r);
  };
  return (
    <div className="relative">
      <div className="flex gap-2">
        <input ref={ref} autoFocus className="input" placeholder={t.pos.scan} value={term} onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => { if (e.key !== "Enter") return; e.preventDefault(); void run(term); }} />
        <CameraScan label={t.pos.extra.camera} unsupported={t.pos.extra.cameraUnsupported} onCode={(c) => void run(c)} />
      </div>
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
  const [custHits, setCustHits] = useState<PosCustomer[] | null>(null);
  const [salesperson, setSalesperson] = useState(p.me.id);
  const [payments, setPayments] = useState<{ method: string; amount: string }[]>([]);
  const [cashGiven, setCashGiven] = useState("");
  const [mgr, setMgr] = useState({ u: "", p: "" });
  const [quoteNo, setQuoteNo] = useState("");
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<{ id: string; no: number }[]>([]); // several quotations on one receipt
  const [editId, setEditId] = useState<string | null>(null); // desk: editing an existing quotation
  const [recDisc, setRecDisc] = useState("");
  const [slipNo, setSlipNo] = useState<string | null>(null); // a desk slip loaded from its QR (no connection)
  const [busy, setBusy] = useState(false);
  const clientId = useRef(uuid());
  const locked = mode === "collect" || slipNo !== null;

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
  const changed = lines.some((l) => ((safeH(l.discount) ?? 0n) > 0n && !l.usual) || l.price !== l.listPrice);
  const pays = payments.length ? payments : [{ method: p.methods[0]?.code ?? "cash", amount: totals ? formatDecimal(totalH) : "" }];

  const focusQty = useRef<string | null>(null);
  useEffect(() => {
    if (!focusQty.current) return;
    const el = document.querySelector<HTMLInputElement>(`input[data-qty="${focusQty.current}"]`);
    focusQty.current = null;
    el?.focus(); el?.select();
  }, [lines]);
  const withUsual = (l: Line, c: PosCustomer | null): Line => (c?.discountPct && (l.usual || (safeH(l.discount) ?? 0n) === 0n) && l.price === l.listPrice
    ? { ...l, discount: usualDiscount(l.price, l.qty, c.discountPct), usual: true } : l);
  function add(h: VariantHit) {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.variantId === h.variantId);
      if (i >= 0) return ls.map((l, j) => (j === i ? withUsual({ ...l, qty: String(Number(l.qty) + 1) }, customer) : l));
      return [...ls, withUsual({ variantId: h.variantId, name: h.name, options: h.options, sku: h.sku, qty: "1", price: h.price, listPrice: h.price, discount: "0" }, customer)];
    });
    focusQty.current = h.variantId; // the quantity box gets the focus after picking an item
    setPayments([]);
  }
  function pickCustomer(c: PosCustomer | null) {
    setCustomer(c);
    if (!locked) setLines((ls) => ls.map((l) => (c ? withUsual(l, c) : l.usual ? { ...l, discount: "0", usual: false } : l)));
    setPayments([]);
  }
  /** Receipt discount: spread over the lines by value; the last line takes the rounding remainder. */
  function applyReceiptDiscount(amount: string) {
    const d = safeH(amount);
    if (d === null || d <= 0n || !totals) return;
    const gross = lines.map((l) => (safeH(l.price) ?? 0n) * (safeQ(l.qty) ?? 0n) / 1000n);
    const sum = gross.reduce((a, b) => a + b, 0n);
    if (sum <= 0n || d > sum) return p.setMsg({ ok: false, text: err("bad_amount") });
    let left = d;
    setLines((ls) => ls.map((l, i) => {
      const part = i === ls.length - 1 ? left : (d * gross[i]) / sum;
      left -= part;
      return { ...l, discount: formatDecimal(part), usual: false };
    }));
    setPayments([]);
  }
  function reset() { setLines([]); setCustomer(null); setPhone(""); setCustName(""); setPayments([]); setCashGiven(""); setMgr({ u: "", p: "" }); setQuoteId(null); setQuoteNo(""); setQuotes([]); setEditId(null); setRecDisc(""); setSlipNo(null); clientId.current = uuid(); }

  /** Every receipt needs the customer unless this person may skip it: a picked customer, or a mobile + name typed here. */
  const typedCustomer = !customer && phone.trim() && custName.trim() ? { customerPhone: phone.trim(), customerName: custName.trim() } : {};
  const customerMissing = mode !== "desk" && !p.can.skipCustomer && !customer && !("customerPhone" in typedCustomer);

  /** No connection: keep the sale on this device with a temporary number; it is sent automatically later. */
  function saveOffline(cart: { variantId: string; qty: string; unitPrice: string; discount: string }[]) {
    const o = t.pos.offline;
    if (!p.off.enabled || !(mode === "sell" || (mode === "collect" && !quotes.length))) return p.setMsg({ ok: false, text: p.off.enabled ? o.needsOnline : o.notEnabled });
    if (changed && p.approval.discount) return p.setMsg({ ok: false, text: o.noApprovalOffline });
    if (pays.some((x) => p.methods.find((m) => m.code === x.method)?.kind === "on_account")) return p.setMsg({ ok: false, text: o.noAccountOffline });
    if (customerMissing) return p.setMsg({ ok: false, text: err("customer_required") });
    const sale = p.off.save({
      clientId: clientId.current, createdAt: new Date().toISOString(), locationId: s.locationId, shiftId: s.id, total: formatDecimal(totalH),
      payload: { salespersonId: salesperson, customerId: customer?.id, ...typedCustomer, lines: cart, payments: pays, cashTendered: cashGiven || undefined, quoteTempNo: slipNo ?? undefined },
      lines: lines.map((l) => ({ name: l.options ? `${l.name} - ${l.options}` : l.name, qty: l.qty, price: l.price, discount: l.discount })),
    });
    const branch = p.locations.find((l) => l.id === s.locationId)?.name ?? "";
    p.setMsg({ ok: true, text: `${o.savedOffline} ${sale.tempNo}${cashGiven && changeH > 0n ? ` · ${t.pos.change}: ${formatDecimal(changeH)}` : ""}` });
    printTempReceipt(sale, { t, locale, company: p.company, branch });
    reset();
  }

  async function loadQuote(no: number) {
    const r = await loadQuotationAction(no, locale);
    if (!r.ok) return p.setMsg({ ok: false, text: err(r.error) });
    const q = r.quote;
    const mapped = q.lines.map((l) => ({ ...l, price: l.unitPrice, listPrice: l.unitPrice }));
    if (mode === "desk") { setEditId(q.id); setLines(mapped); }
    else {
      if (quotes.some((x) => x.id === q.id)) return;
      setQuotes((qs) => [...qs, { id: q.id, no: q.quoteNo }]);
      if (!quoteId) setQuoteId(q.id);
      setLines((ls) => [...ls, ...mapped]);
    }
    if (q.customer && !customer) setCustomer(q.customer);
    if (q.salespersonId) setSalesperson(q.salespersonId);
    setQuoteNo(""); setPayments([]); setSlipNo(null);
  }

  /** Desk with no connection: the quotation waits on this device (temporary number) and its slip carries a QR. */
  function saveOfflineQuote(cart: QrLine[]) {
    const o = t.pos.offline;
    if (!p.off.enabled) return p.setMsg({ ok: false, text: o.notEnabled });
    if (changed && p.approval.discount) return p.setMsg({ ok: false, text: o.noApprovalOffline });
    const tempNo = p.off.saveQuote({ clientId: clientId.current, label: formatDecimal(totalH), payload: { locationId: s.locationId, salespersonId: salesperson, customerId: customer?.id, lines: cart } });
    const branch = p.locations.find((l) => l.id === s.locationId)?.name ?? "";
    void printTempQuote({ tempNo, total: formatDecimal(totalH), createdAt: new Date().toISOString(), cart,
      lines: lines.map((l) => ({ name: l.options ? `${l.name} - ${l.options}` : l.name, qty: l.qty, price: l.price, discount: l.discount })) }, { t, locale, company: p.company, branch });
    p.setMsg({ ok: true, text: `${o.quoteSavedOffline} ${tempNo}` });
    reset();
  }

  /**
   * A desk slip scanned at the till (its QR, or its temporary number typed). Online: the real
   * quotation is collected. Offline (or not sent yet): its lines come from the QR itself.
   */
  async function fromSlip(text: string) {
    const qr = decodeQuoteQr(text);
    const no = qr?.no ?? text.trim();
    if (p.off.online) {
      try {
        const real = /^\d+$/.test(no) ? Number(no) : await quoteNoForTempAction(no).then((r) => (r.ok ? r.quoteNo : null));
        if (real) { if (mode !== "collect") p.setMsg({ ok: false, text: `${t.pos.extra.slipIsQuote} #${real}` }); else await loadQuote(real); return; }
      } catch { /* offline: use the QR */ }
    }
    if (!qr) return p.setMsg({ ok: false, text: err("quote_not_found") });
    setLines(qr.lines.map((l) => {
      const it = p.off.itemById(l.variantId);
      return { variantId: l.variantId, name: it?.n ?? "—", options: it?.o ?? "", sku: it?.s ?? null, qty: l.qty, price: l.unitPrice, listPrice: l.unitPrice, discount: l.discount, usual: Number(l.discount) > 0 };
    }));
    setSlipNo(qr.no); setPayments([]);
    p.setMsg({ ok: true, text: `${t.pos.extra.slipLoaded} ${qr.no}` });
  }

  async function submit() {
    setBusy(true);
    p.setMsg(null);
    const cart = lines.map((l) => ({ variantId: l.variantId, qty: l.qty, unitPrice: l.price, discount: l.discount }));
    if (customerMissing) { setBusy(false); return p.setMsg({ ok: false, text: err("customer_required") }); }
    const offlineOk = mode === "sell" || (mode === "collect" && !quotes.length) || (mode === "desk" && !editId);
    const keep = () => (mode === "desk" ? saveOfflineQuote(cart) : saveOffline(cart));
    if (offlineOk && p.off.enabled && !p.off.online) { setBusy(false); return keep(); }
    try { await submitOnline(cart); } catch (e) {
      if (looksOffline(e)) { if (offlineOk) keep(); else p.setMsg({ ok: false, text: t.pos.offline.needsOnline }); } else p.setMsg({ ok: false, text: String(e) });
    } finally { setBusy(false); }
  }

  async function submitOnline(cart: { variantId: string; qty: string; unitPrice: string; discount: string }[]) {
    if (mode === "desk" && editId) {
      const r = await updateQuotationAction({ quotationId: editId, customerId: customer?.id, salespersonId: salesperson, lines: cart, approverUsername: mgr.u, approverPin: mgr.p });
      setBusy(false);
      if (r.ok) { p.setMsg({ ok: true, text: `${t.pos.extra.quoteUpdated} ${r.quoteNo}` }); reset(); p.router.refresh(); } else p.setMsg({ ok: false, text: err(r.error) });
      return;
    }
    if (mode === "desk") {
      const r = await saveQuotationAction({ clientId: clientId.current, locationId: s.locationId, salespersonId: salesperson, customerId: customer?.id, lines: cart, approverUsername: mgr.u, approverPin: mgr.p });
      setBusy(false);
      if (r.ok) { p.setMsg({ ok: true, text: `${t.pos.quoteSaved} ${r.quoteNo}` }); reset(); p.router.refresh(); } else p.setMsg({ ok: false, text: err(r.error) });
      return;
    }
    const r = await postSaleAction({
      clientId: clientId.current, locationId: s.locationId, shiftId: s.id, salespersonId: salesperson, customerId: customer?.id, ...typedCustomer,
      quotationId: quoteId ?? undefined, quotationIds: quotes.map((q) => q.id), lines: cart, payments: pays, cashTendered: cashGiven || undefined, approverUsername: mgr.u, approverPin: mgr.p,
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
        {mode === "collect" || mode === "desk" ? (
          <div className="space-y-3">
            {mode === "desk" && <ItemSearch t={t} locale={locale} onPick={add} off={p.off} />}
            <div className="flex gap-2">
              <input className="input" dir="ltr" inputMode="numeric" placeholder={mode === "desk" ? t.pos.extra.editQuote : t.pos.quoteNo} value={quoteNo} onChange={(e) => setQuoteNo(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.currentTarget.nextSibling as HTMLButtonElement)?.click(); } }} />
              <button className="btn-ghost whitespace-nowrap" onClick={async () => {
                if (mode === "collect" && !/^\d+$/.test(quoteNo.trim())) { const v = quoteNo; setQuoteNo(""); return fromSlip(v); }
                await loadQuote(Number(quoteNo));
              }}>{mode === "desk" ? t.pos.extra.load : quotes.length ? t.pos.extra.addQuote : t.pos.loadQuote}</button>
            </div>
            {(quotes.length > 0 || editId) && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {quotes.length > 0 && <span className="text-gray-600">{t.pos.extra.quotesOnReceipt}:</span>}
                {quotes.map((q) => <span key={q.id} className="badge-blue">#{q.no}</span>)}
                {editId && <span className="badge-blue">{t.pos.extra.editQuote}</span>}
                <button className="text-xs text-red-600 underline" onClick={async () => {
                  for (const id of editId ? [editId] : quotes.map((q) => q.id)) await cancelQuotationAction(id);
                  p.setMsg({ ok: true, text: t.pos.extra.quoteCancelled }); reset(); p.router.refresh();
                }}>{t.pos.extra.cancelQuote}</button>
              </div>
            )}
            {mode === "collect" && !quotes.length && (
              <div className="text-sm">
                <div className="mb-1 font-medium text-gray-700">{t.pos.openQuotes}</div>
                {p.quotes.length === 0 ? <p className="text-gray-500">{t.pos.noQuotes}</p> : (
                  <div className="flex flex-wrap gap-2">
                    {p.quotes.map((q) => <button key={q.no} className="btn-ghost" onClick={() => setQuoteNo(String(q.no))}>#{q.no} · {q.total}</button>)}
                  </div>
                )}
              </div>
            )}
          </div>        ) : (
          <ItemSearch t={t} locale={locale} onPick={add} off={p.off} onSlip={(x) => void fromSlip(x)} />
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
                    <td data-label={t.pos.qty}><input data-qty={l.variantId} className="input w-20" dir="ltr" inputMode="decimal" value={l.qty} disabled={locked} onChange={(e) => set(l.usual ? { qty: e.target.value, discount: usualDiscount(l.price, e.target.value, customer?.discountPct) } : { qty: e.target.value })} /></td>
                    <td data-label={t.pos.price}><input className="input w-24" dir="ltr" inputMode="decimal" value={l.price} disabled={locked || !p.can.priceChange} onChange={(e) => set({ price: e.target.value })} /></td>
                    {p.can.discount && <td data-label={t.pos.discount}><input className="input w-20" dir="ltr" inputMode="decimal" value={l.discount} disabled={locked} onChange={(e) => set({ discount: e.target.value, usual: false })} /></td>}
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
          {p.can.discount && !locked && lines.length > 0 && (
            <div className="flex gap-2 pt-2">
              <input className="input" dir="ltr" inputMode="decimal" placeholder={t.pos.extra.receiptDiscount} value={recDisc} onChange={(e) => setRecDisc(e.target.value)} />
              <button type="button" className="btn-ghost" onClick={() => applyReceiptDiscount(recDisc)}>{t.pos.extra.apply}</button>
            </div>
          )}
        </section>

        <section className="card space-y-2">
          <label className="label">{t.pos.customer}</label>
          {customer ? (
            <CustomerPicker t={t} value={customer} onPick={pickCustomer} err={err} setMsg={p.setMsg} disabled={locked} off={p.off} />
          ) : (
            <>
              <div className="flex gap-2">
                <input className="input" placeholder={t.pos.extra.searchCustomer} value={phone} onChange={(e) => { setPhone(e.target.value); setCustNotFound(false); setCustHits(null); }} />
                <button className="btn-ghost" onClick={async () => {
                  const r = await findCustomers(phone, p.off);
                  if (!r.ok) return p.setMsg({ ok: false, text: err(r.error) });
                  if (r.customers.length === 1) pickCustomer(r.customers[0]);
                  else if (r.customers.length > 1) setCustHits(r.customers);
                  else setCustNotFound(true);
                }}>{t.pos.findCustomer}</button>
              </div>
              {custHits && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--line)]">
                  {custHits.map((c) => <button key={c.id} type="button" onClick={() => { pickCustomer(c); setCustHits(null); }} className="block w-full px-3 py-2 text-start text-sm hover:bg-gray-50">{c.name} · <span dir="ltr">{c.phone}</span> · #{c.customerNo}</button>)}
                </div>
              )}
              {(custNotFound || (!p.can.skipCustomer && phone.trim() !== "")) && p.can.addCustomer && (
                <div className="flex gap-2">
                  <input className="input" placeholder={t.pos.customerName} value={custName} onChange={(e) => setCustName(e.target.value)} />
                  <button className="btn-ghost" onClick={async () => {
                    const r = await quickAddCustomerAction(phone, custName);
                    if (r.ok) pickCustomer(r.customer); else p.setMsg({ ok: false, text: err(r.error) });
                  }}>{t.pos.addCustomer}</button>
                </div>
              )}
              <p className="hint">{p.can.skipCustomer || mode === "desk" ? t.pos.walkIn : t.pos.errors.customer_required}</p>
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

function ReturnView(p: Props & { off: OfflineTill; setMsg: (m: { ok: boolean; text: string; href?: string; onClick?: () => void; label?: string } | null) => void; err: (c: string) => string; router: ReturnType<typeof useRouter> }) {
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

  const reset = () => { setInv(null); setQty({}); setItems([]); setNumber(""); setReason(""); setMgr({ u: "", p: "" }); clientId.current = uuid(); };
  const o = t.pos.offline;
  const off = p.off;

  /** No internet: the return is kept on this device with a temporary number and sent later (same client id). */
  function saveOffline(lines: { lineNo?: number; variantId?: string; qty: string }[]) {
    if (!off.enabled) return p.setMsg({ ok: false, text: o.notEnabled });
    if (p.approval.ret) return p.setMsg({ ok: false, text: o.noApprovalReturnOffline });
    const amounts: { name: string; qty: string; amount: string }[] = [];
    if (!noReceipt) {
      if (!inv) return;
      for (const l of lines) {
        const line = inv.lines.find((x) => x.lineNo === l.lineNo);
        const a = line ? returnLineAmount([line.lineNo, line.name, line.sku, line.qty, line.returnable, line.gross], l.qty) : null;
        if (!line || !a) return p.setMsg({ ok: false, text: err("bad_qty") });
        amounts.push({ name: line.name, qty: l.qty, amount: a });
      }
    } else {
      for (const i of items) {
        const a = noReceiptAmount(i.price, i.qty);
        if (!a) return p.setMsg({ ok: false, text: err("bad_qty") });
        amounts.push({ name: i.name, qty: i.qty, amount: a });
      }
    }
    const total = sumAmounts(amounts.map((x) => x.amount));
    const saved = off.saveReturn({
      clientId: clientId.current, label: `${t.pos.refund} ${total}`, total,
      payload: { locationId: s.locationId, originalInvoiceId: noReceipt ? undefined : inv?.id, customerId: inv?.customerId ?? undefined, reason, refundMethod: method, lines },
      slip: { original: noReceipt ? null : inv?.number ?? null, lines: amounts },
    });
    const branch = p.locations.find((l) => l.id === s.locationId)?.name ?? "";
    printTempReturn(saved, { t, locale, company: p.company, branch });
    p.setMsg({ ok: true, text: `${o.returnSavedOffline} ${saved.tempNo} · ${t.pos.refund} ${total}` });
    reset();
  }

  async function submit() {
    const lines = noReceipt
      ? items.map((i) => ({ variantId: i.variantId, qty: i.qty }))
      : Object.entries(qty).filter(([, q]) => Number(q) > 0).map(([lineNo, q]) => ({ lineNo: Number(lineNo), qty: q }));
    if (!lines.length) return p.setMsg({ ok: false, text: err("no_lines") });
    if (!off.online) return saveOffline(lines);
    setBusy(true);
    try {
      const r = await postReturnAction({ clientId: clientId.current, locationId: s.locationId, shiftId: s.id, originalInvoiceId: noReceipt ? undefined : inv?.id, customerId: inv?.customerId ?? undefined, reason, lines, refundMethod: method, approverUsername: mgr.u, approverPin: mgr.p });
      if (r.ok) {
        p.setMsg({ ok: true, text: `${t.pos.returnDone} ${r.number} · ${t.pos.refund} ${r.total}`, href: `/sales/${r.invoiceId}?print=1` });
        reset();
      } else p.setMsg({ ok: false, text: err(r.error) });
    } catch (e) {
      if (looksOffline(e)) saveOffline(lines); else p.setMsg({ ok: false, text: String(e) });
    } finally { setBusy(false); }
  }

  /** Find the receipt: on the server, or (no internet) in the copy kept on this device. */
  async function find() {
    const local = () => {
      const x = off.findInvoiceLocal(number);
      if (!x) return p.setMsg({ ok: false, text: o.receiptNotOnDevice });
      setInv({ id: x.i, number: x.n, issuedAt: x.t, customerId: x.c, total: "", lines: x.l.map(([lineNo, name, sku, q, returnable, gross]) => ({ lineNo, name, sku, qty: q, returnable, gross })) });
      setQty({}); p.setMsg(null);
    };
    if (!off.online) return local();
    try {
      const r = await findInvoiceForReturnAction(number);
      if (r.ok) { setInv(r.invoice); setQty({}); } else p.setMsg({ ok: false, text: err(r.error) });
    } catch (e) { if (looksOffline(e)) local(); else p.setMsg({ ok: false, text: String(e) }); }
  }

  return (
    <section className="card space-y-4">
      {p.can.retNoReceipt && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={noReceipt} onChange={(e) => { setNoReceipt(e.target.checked); setInv(null); }} className="h-4 w-4 accent-[var(--brand)]" /> {t.pos.noReceipt}</label>}
      {!noReceipt ? (
        <>
          <div className="flex gap-2">
            <input className="input" dir="ltr" placeholder={t.pos.invoiceNo} value={number} onChange={(e) => setNumber(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget.nextElementSibling as HTMLButtonElement)?.click(); }} />
            <button className="btn-ghost" onClick={() => void find()}>{t.pos.find}</button>
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
          <ItemSearch t={t} locale={locale} off={off} onPick={(h) => setItems((xs) => (xs.some((x) => x.variantId === h.variantId) ? xs : [...xs, { variantId: h.variantId, name: h.name, qty: "1", price: h.price }]))} />
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
