import Link from "next/link";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { ReportFilters } from "@/components/ReportFilters";
import { reportAccess } from "@/lib/report-access";
import { allRows, range } from "@/lib/report-range";
import { B2B_STATUSES, type B2bStatus } from "@/lib/purchasing";

export const dynamic = "force-dynamic";

/** B2B report: orders in a period by customer and by stage, and every delivered order still to be paid. */
export default async function B2bReport({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { t, locale } = await getDict();
  const P = t.rep;
  await reportAccess(locale, "sales.b2b");
  const sp = await searchParams;
  const { from, to, fromIso, toIso } = range(sp);
  type O = { id: string; order_no: number; customer_id: string; customer_name: string; status: B2bStatus; gross_total: string; paid: string; due: string; due_on: string | null };
  const cols = "id, order_no, customer_id, customer_name, status, gross_total, paid, due, due_on";
  const [orders, open] = await Promise.all([
    allRows<O>((a, b) => db().from("b2b_list").select(cols).gte("created_at", fromIso).lte("created_at", toIso).neq("status", "cancelled").range(a, b)),
    allRows<O>((a, b) => db().from("b2b_list").select(cols).in("status", ["delivered", "invoiced"]).gt("due", 0).order("order_no").range(a, b)),
  ]);
  const byCust = new Map<string, { name: string; n: number; total: number; paid: number; due: number }>();
  for (const o of orders) {
    const x = byCust.get(o.customer_id) ?? { name: o.customer_name, n: 0, total: 0, paid: 0, due: 0 };
    x.n++; x.total += Number(o.gross_total); x.paid += Number(o.paid); x.due += Number(o.due);
    byCust.set(o.customer_id, x);
  }
  const f = (x: number) => x.toFixed(2);
  return (
    <>
      <PageHeader title={P.cards.b2b[0]} subtitle={`${from} → ${to}`} t={t} filename={`b2b-report-${from}-${to}`}>
        <Link href="/sales/reports" className="btn-ghost no-print">← {t.reports.allReports}</Link>
      </PageHeader>
      <ReportFilters t={t} action="/sales/reports/b2b" from={from} to={to} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="b2b-stages">
        {B2B_STATUSES.filter((s) => s !== "cancelled").map((s) => {
          const os = orders.filter((o) => o.status === s);
          return <div key={s} className="card"><div className="text-xs text-gray-500">{t.b2b.statuses[s]}</div><div className="text-xl font-semibold">{os.length}</div><div className="text-xs text-gray-500" dir="ltr">{f(os.reduce((a, o) => a + Number(o.gross_total), 0))}</div></div>;
        })}
      </div>
      <section className="card mb-6 overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{P.byCustomer}</h2>
        {byCust.size === 0 ? <p className="px-5 pb-5 text-sm text-gray-500">{P.none}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-export>
            <thead><tr><th>{P.customer}</th><th>{P.orders}</th><th>{P.total}</th><th>{P.paid}</th><th>{P.due}</th></tr></thead>
            <tbody>
              {[...byCust.entries()].sort((a, b) => b[1].total - a[1].total).map(([id, x]) => (
                <tr key={id}>
                  <td className="cell-title"><Link href={`/customers/${id}`} className="underline">{x.name || "—"}</Link></td>
                  <td data-label={P.orders}>{x.n}</td>
                  <td data-label={P.total} dir="ltr">{f(x.total)}</td>
                  <td data-label={P.paid} dir="ltr">{f(x.paid)}</td>
                  <td data-label={P.due} dir="ltr" className="font-semibold">{f(x.due)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
      <section className="card overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{P.dueList} · <span dir="ltr">{f(open.reduce((a, o) => a + Number(o.due), 0))}</span></h2>
        {open.length === 0 ? <p className="px-5 pb-5 text-sm text-gray-500">{P.none}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="b2b-due">
            <thead><tr><th>{t.b2b.order}</th><th>{P.customer}</th><th>{P.stage}</th><th>{P.total}</th><th>{P.due}</th></tr></thead>
            <tbody>
              {open.map((o) => (
                <tr key={o.id}>
                  <td className="cell-title"><Link href={`/sales/b2b/${o.id}`} className="underline" dir="ltr">B2B-{o.order_no}</Link></td>
                  <td data-label={P.customer}>{o.customer_name || "—"}</td>
                  <td data-label={P.stage}>{t.b2b.statuses[o.status]}</td>
                  <td data-label={P.total} dir="ltr">{f(Number(o.gross_total))}</td>
                  <td data-label={P.due} dir="ltr" className="font-semibold">{f(Number(o.due))}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
