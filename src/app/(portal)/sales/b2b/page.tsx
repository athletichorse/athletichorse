import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { B2B_STATUSES, B2B_TONE, type B2bStatus } from "@/lib/purchasing";

export const dynamic = "force-dynamic";


/** B2B orders: every business order by stage, with what is still to be paid. */
export default async function B2bOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requirePermission("sales.b2b");
  const { t } = await getDict();
  const B = t.b2b;
  const sp = await searchParams;
  const status = (B2B_STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as B2bStatus) : null;
  const q = String(sp.q ?? "").trim().slice(0, 60);
  const { data: all } = await db().from("b2b_list").select("id, order_no, customer_name, customer_no, status, due_on, customer_ref, gross_total, paid, due, created_at").order("order_no", { ascending: false }).limit(2000);
  const counts = Object.fromEntries(B2B_STATUSES.map((s) => [s, (all ?? []).filter((o) => o.status === s).length]));
  const ql = q.toLowerCase();
  const rows = (all ?? []).filter((o) => (!status || o.status === status) && (!q || String(o.order_no) === q.replace(/^B2B-?/i, "") || (o.customer_name ?? "").toLowerCase().includes(ql) || (o.customer_ref ?? "").toLowerCase().includes(ql)));
  const toCollect = (all ?? []).filter((o) => ["delivered", "invoiced"].includes(o.status)).reduce((a, o) => a + Number(o.due), 0);
  const href = (s: string | null) => `/sales/b2b?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(q ? { q } : {}) })}`;
  return (
    <>
      <PageHeader title={B.title} subtitle={B.subtitle} t={t} filename="b2b-orders">
        <div className="no-print"><Link href="/sales/b2b/new" className="btn-primary" data-testid="new-b2b">+ {B.newOrder}</Link></div>
      </PageHeader>
      <p className="mb-3 text-sm" data-testid="b2b-to-collect">{B.due2}: <b dir="ltr">{toCollect.toFixed(2)} SAR</b></p>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Link href={href(null)} className={!status ? "btn-primary" : "btn-ghost"}>{B.all} ({(all ?? []).length})</Link>
        {B2B_STATUSES.map((s) => <Link key={s} href={href(s)} className={status === s ? "btn-primary" : "btn-ghost"}>{B.statuses[s]} ({counts[s]})</Link>)}
        <form className="flex gap-2" action="/sales/b2b">
          {status && <input type="hidden" name="status" value={status} />}
          <input name="q" defaultValue={q} className="input w-56" placeholder={B.search} aria-label={B.search} />
          <button className="btn-ghost">{B.find}</button>
        </form>
      </div>
      <section className="card overflow-hidden p-0">
        {rows.length === 0 ? <p className="p-5 text-sm text-gray-500">{B.none}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="b2b-table">
            <thead><tr><th>{B.order}</th><th>{B.customer}</th><th>{B.status}</th><th>{B.due}</th><th>{B.total}</th><th>{B.due2}</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} data-b2b={o.order_no}>
                  <td className="cell-title"><Link href={`/sales/b2b/${o.id}`} className="font-medium underline" dir="ltr" data-testid="b2b-link">B2B-{o.order_no}</Link><div className="text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" })}</div></td>
                  <td data-label={B.customer}>{o.customer_name || "—"}<span className="text-xs text-gray-400" dir="ltr"> #{o.customer_no}</span>{o.customer_ref && <div className="text-xs text-gray-400" dir="ltr">{o.customer_ref}</div>}</td>
                  <td data-label={B.status}><span className={B2B_TONE[o.status as B2bStatus]}>{B.statuses[o.status as B2bStatus]}</span></td>
                  <td data-label={B.due}>{o.due_on ?? "—"}</td>
                  <td data-label={B.total} dir="ltr" className="font-semibold">{Number(o.gross_total).toFixed(2)}</td>
                  <td data-label={B.due2} dir="ltr">{o.status === "cancelled" ? "—" : Number(o.due).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
