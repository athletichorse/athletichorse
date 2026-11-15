import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime, riyadhDate } from "@/lib/time";
import { formatSAR, toHalalas } from "@/lib/money";
import { PageHeader } from "@/components/PageHeader";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PendingButton } from "@/components/PendingButton";
import { syncOrdersNowAction } from "@/app/actions/sales";
import { ordersConfig } from "@/lib/shopify-orders";

export const maxDuration = 300;
type SP = { tab?: string; page?: string; err?: string; started?: string };

export default async function SalesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requirePermission("sales.view");
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const tab = sp.tab === "returns" || sp.tab === "website" ? sp.tab : "invoices";
  const page = Math.max(1, Number(sp.page) || 1);
  const allBranches = me.perms.has("sales.view_all_branches");
  const sar = (v: string | number) => formatSAR(toHalalas(String(Number(v).toFixed(2))), locale);
  const tabLink = (k: string, label: string) => (
    <Link href={`/sales?tab=${k}`} className={`rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap ${tab === k ? "bg-[var(--brand)] text-white" : "border border-[var(--line)] bg-white text-gray-700"}`}>{label}</Link>
  );

  // today's totals (Riyadh)
  const today = riyadhDate();
  const startUtc = new Date(`${today}T00:00:00+03:00`).toISOString();
  let todayQ = db().from("invoices").select("kind, gross_total").gte("issued_at", startUtc);
  if (!allBranches) todayQ = me.locations === "all" ? todayQ : todayQ.in("location_id", me.locations);
  const { data: todayRows } = await todayQ;
  const todaySales = (todayRows ?? []).filter((r) => r.kind === "invoice").reduce((a, r) => a + Number(r.gross_total), 0);
  const todayReturns = (todayRows ?? []).filter((r) => r.kind === "credit_note").reduce((a, r) => a + Number(r.gross_total), 0);

  let body: React.ReactNode;
  let count = 0;
  let running = false;
  if (tab === "website") {
    const [{ data, count: c }, { data: lastRun }] = await Promise.all([
      db().from("web_orders").select("id, name, created_at, customer_name, city, financial_status, fulfillment_status, cancelled_at, total", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * 50, page * 50 - 1),
      db().from("sync_runs").select("started_at, status, counts, error").eq("source", "shopify_orders").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    count = c ?? 0;
    running = lastRun?.status === "running";
    const connected = Boolean(ordersConfig());
    body = (
      <>
        <div className="card no-print mb-4 flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1 text-sm">
            <div className="text-gray-500">{t.sales.lastOrdersSync}</div>
            <div className="font-medium text-gray-900">
              {lastRun ? `${formatDateTime(new Date(lastRun.started_at), locale)} · ${lastRun.status === "ok" ? t.products.syncOk : lastRun.status === "error" ? t.products.syncError : t.products.syncRunning}` : t.products.never}
            </div>
            {lastRun?.status === "error" && <p className="text-red-600">{lastRun.error}</p>}
            {!connected && <p className="mt-1 text-amber-700">{t.sales.ordersNotConnected}</p>}
            <p className="hint">{t.products.syncDaily}</p>
          </div>
          {connected && allBranches && (
            <form action={syncOrdersNowAction}><PendingButton className="btn-ghost" label={t.sales.syncOrders} pendingLabel={t.products.syncRunning} disabled={running} /></form>
          )}
        </div>
        <div className="card overflow-hidden p-0"><div className="overflow-x-auto">
          <table className="table" data-export>
            <thead><tr><th>{t.sales.number}</th><th>{t.sales.date}</th><th>{t.sales.customer}</th><th>{t.sales.status}</th><th>{t.sales.total}</th></tr></thead>
            <tbody>
              {(data ?? []).length === 0 && <tr><td colSpan={5} className="py-10 text-center text-gray-500">{t.sales.none}</td></tr>}
              {(data ?? []).map((o) => (
                <tr key={o.id}>
                  <td className="cell-title font-mono">{o.name}</td>
                  <td data-label={t.sales.date} className="text-xs text-gray-500">{formatDateTime(new Date(o.created_at), locale)}</td>
                  <td data-label={t.sales.customer}>{o.customer_name}{o.city && <div className="text-xs text-gray-500">{o.city}</div>}</td>
                  <td data-label={t.sales.status}>{o.cancelled_at ? <span className="badge-gray">{t.sales.cancelled}</span> : <span className={o.financial_status === "paid" ? "badge-green" : "badge-blue"}>{o.financial_status} · {o.fulfillment_status}</span>}</td>
                  <td data-label={t.sales.total} className="font-semibold">{sar(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      </>
    );
  } else {
    let q = db().from("sales_list").select("id, kind, number, issued_at, location_en, location_ar, gross_total, vat_total, customer_name, customer_phone, cashier_name, methods, offline_temp_no", { count: "exact" }).eq("kind", tab === "returns" ? "credit_note" : "invoice");
    if (!allBranches && me.locations !== "all") q = q.in("location_id", me.locations);
    const { data, count: c } = await q.order("issued_at", { ascending: false }).range((page - 1) * 50, page * 50 - 1);
    count = c ?? 0;
    body = (
      <div className="card overflow-hidden p-0"><div className="overflow-x-auto">
        <table className="table" data-export>
          <thead><tr><th>{t.sales.number}</th><th>{t.sales.date}</th><th>{t.sales.branch}</th><th>{t.sales.customer}</th><th>{t.sales.cashier}</th><th>{t.sales.vat}</th><th>{t.sales.total}</th><th></th></tr></thead>
          <tbody>
            {(data ?? []).length === 0 && <tr><td colSpan={8} className="py-10 text-center text-gray-500">{t.sales.none}</td></tr>}
            {(data ?? []).map((r) => (
              <tr key={r.id}>
                <td className="cell-title font-mono" dir="ltr">{r.number}</td>
                <td data-label={t.sales.date} className="text-xs text-gray-500">{formatDateTime(new Date(r.issued_at), locale)}</td>
                <td data-label={t.sales.branch}>{locale === "ar" ? r.location_ar : r.location_en}</td>
                <td data-label={t.sales.customer}>{r.customer_name || r.customer_phone || "—"}</td>
                <td data-label={t.sales.cashier}>{r.cashier_name}</td>
                <td data-label={t.sales.vat}>{sar(r.vat_total)}</td>
                <td data-label={t.sales.total} className="font-semibold">{sar(r.gross_total)}<div className="text-xs font-normal text-gray-500">{r.methods}</div></td>
                <td><Link href={`/sales/${r.id}`} className="text-sm text-[var(--brand)] underline">{t.sales.reprint}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    );
  }

  return (
    <>
      <PageHeader title={t.sales.title} subtitle={t.sales.subtitle} t={t} filename={`sales-${tab}`} />
      {sp.err === "not_connected" && <p className="alert-err">{t.sales.ordersNotConnected}</p>}
      <AutoRefresh active={running || Boolean(sp.started)} everyMs={4000} />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="card p-4"><div className="text-sm text-gray-500">{t.sales.today} · {t.sales.invoices}</div><div className="text-2xl font-semibold">{sar(todaySales)}</div></div>
        <div className="card p-4"><div className="text-sm text-gray-500">{t.sales.today} · {t.sales.creditNotes}</div><div className="text-2xl font-semibold">{sar(todayReturns)}</div></div>
      </div>
      <div className="no-print mb-4 flex gap-2 overflow-x-auto pb-1">
        {tabLink("invoices", t.sales.invoices)}{tabLink("returns", t.sales.creditNotes)}{tabLink("website", t.sales.website)}
      </div>
      {body}
      <div className="no-print mt-4 flex items-center justify-end gap-2 text-sm text-gray-600">
        {page > 1 && <Link href={`/sales?tab=${tab}&page=${page - 1}`} className="btn-ghost">{t.products.prev}</Link>}
        <span>{count}</span>
        {page * 50 < count && <Link href={`/sales?tab=${tab}&page=${page + 1}`} className="btn-ghost">{t.products.next}</Link>}
      </div>
    </>
  );
}
