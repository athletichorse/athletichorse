import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { OrdersFollowTable, type FollowRow } from "@/components/OrdersFollowTable";
import { addOrderAction, fetchWebOrdersAction } from "@/app/actions/orders";
import { FOLLOW_STATUSES, type FollowStatus } from "@/lib/order-follow";

export const dynamic = "force-dynamic";
const COMMON_COURIERS = ["Aramex", "SMSA", "J&T", "SPL", "Naqel", "DHL", "مندوب خاص"];

/** Order follow-up: website orders from order to cash collected. */
export default async function OrdersFollowUp({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermission("sales.website_orders");
  const { t, locale } = await getDict();
  const O = t.orders;
  const sp = await searchParams;

  const [{ data: orders }, { data: follow }, { data: locs }] = await Promise.all([
    db().from("web_orders").select("id, name, created_at, cancelled_at, financial_status, fulfillment_status, customer_name, phone, city, province, address, total").order("created_at", { ascending: false }).limit(2000),
    db().from("web_order_follow").select("order_id, status, courier, waybill, size, branch_id, notes"),
    db().from("locations").select("id, code, name_en, name_ar").eq("active", true).order("code"),
  ]);
  const branches = (locs ?? []).map((l) => ({ id: l.id, name: (locale === "ar" && l.name_ar) || l.name_en || l.code }));
  const fmap = new Map((follow ?? []).map((f) => [f.order_id, f]));
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });

  type Full = FollowRow & { search: string; created: string };
  const all: Full[] = (orders ?? []).map((o) => {
    const f = fmap.get(o.id);
    const web = o.cancelled_at ? "cancelled" : ["unfulfilled", "fulfilled", "partially_fulfilled", "on_hold"].includes(o.fulfillment_status) ? o.fulfillment_status : "other";
    const paidOnline = o.financial_status === "paid";
    const noMoney = paidOnline || ["voided", "refunded"].includes(o.financial_status);
    const status = (f?.status ?? (o.cancelled_at ? "cancelled" : "new")) as FollowStatus;
    const address = [o.province, o.city].filter(Boolean).join(" - ") + (o.address ? ` · ${o.address}` : "");
    return {
      id: o.id, name: o.name, address, date: day(o.created_at), created: day(o.created_at), web, paidOnline,
      amount: noMoney ? "0.00" : Number(o.total).toFixed(2), status, courier: f?.courier ?? "", waybill: f?.waybill ?? "",
      size: (f?.size ?? "normal") as "normal" | "bulky", branchId: f?.branch_id ?? "", notes: f?.notes ?? "",
      search: [o.name, o.customer_name, o.phone, o.city, o.province, o.address, f?.waybill, f?.courier].filter(Boolean).join(" ").toLowerCase(),
    };
  });

  const q = (sp.q ?? "").trim().toLowerCase();
  const rows = all.filter((r) =>
    (!q || r.search.includes(q.replace(/^#/, "")) || r.name.toLowerCase().includes(q)) &&
    (!sp.status || r.status === sp.status) && (!sp.web || r.web === sp.web) && (!sp.branch || r.branchId === sp.branch) &&
    (!sp.from || r.created >= sp.from) && (!sp.to || r.created <= sp.to) && (sp.nowaybill !== "1" || !r.waybill));
  const count = (s: FollowStatus) => rows.filter((r) => r.status === s).length;
  const remaining = rows.filter((r) => !["collected", "cancelled", "returned"].includes(r.status)).reduce((a, r) => a + Number(r.amount), 0);
  const couriers = [...new Set([...COMMON_COURIERS, ...all.map((r) => r.courier).filter(Boolean)])];
  const err = sp.err ? (O.errors as Record<string, string>)[sp.err] ?? sp.err : null;

  return (
    <>
      <PageHeader title={O.title} subtitle={O.subtitle} t={t} filename="order-follow-up">
        <form action={fetchWebOrdersAction} className="no-print"><button className="btn-primary">{O.fetch}</button></form>
      </PageHeader>
      {err && <p className="alert-err">{err}</p>}
      {sp.fetched && <p className="alert-ok">{O.fetched}: {sp.fetched}</p>}
      {sp.added && <p className="alert-ok">{O.added}: #{sp.added}</p>}

      <form className="no-print mb-3 flex flex-wrap items-end gap-2" action="/sales/orders">
        <input name="q" defaultValue={sp.q ?? ""} placeholder={O.search} aria-label={O.search} className="input min-w-[14rem] flex-1" />
        <select name="status" defaultValue={sp.status ?? ""} aria-label={O.status} className="input w-auto"><option value="">{O.allStatuses}</option>{FOLLOW_STATUSES.map((s) => <option key={s} value={s}>{O.statuses[s]}</option>)}</select>
        <select name="web" defaultValue={sp.web ?? ""} aria-label={O.web} className="input w-auto"><option value="">{O.allWeb}</option>{(Object.keys(O.webStatuses) as (keyof typeof O.webStatuses)[]).map((s) => <option key={s} value={s}>{O.webStatuses[s]}</option>)}</select>
        <select name="branch" defaultValue={sp.branch ?? ""} aria-label={O.branch} className="input w-auto"><option value="">{O.allBranches}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <label className="text-xs text-gray-600">{O.from}<input type="date" name="from" defaultValue={sp.from ?? ""} className="input" dir="ltr" /></label>
        <label className="text-xs text-gray-600">{O.to}<input type="date" name="to" defaultValue={sp.to ?? ""} className="input" dir="ltr" /></label>
        <label className="flex items-center gap-2 pb-2.5 text-sm"><input type="checkbox" name="nowaybill" value="1" defaultChecked={sp.nowaybill === "1"} className="h-4 w-4 accent-[var(--brand)]" />{O.noWaybill}</label>
        <button className="btn-ghost">{O.show}</button>
      </form>

      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <form action={addOrderAction} className="flex gap-2">
          <input name="number" placeholder={O.number} aria-label={O.number} className="input w-36" dir="ltr" required />
          <button className="btn-ghost">{O.add}</button>
        </form>
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-sm" data-testid="orders-counts">
        <span className="badge-gray">{rows.length} {O.total}</span>
        {(["new", "confirmed", "shipped", "collected", "cancelled"] as FollowStatus[]).map((s) => <span key={s} className="badge-gray">{O.statuses[s]}: {count(s)}</span>)}
        <span className="badge whitespace-nowrap bg-[var(--brand-soft)] text-[var(--brand)]" data-testid="orders-remaining">{`${O.remaining}: ${remaining.toFixed(2)} SAR`}</span>
      </div>

      <OrdersFollowTable t={t} rows={rows.slice(0, 500)} branches={branches} couriers={couriers} />
    </>
  );
}
