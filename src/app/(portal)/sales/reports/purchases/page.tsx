import Link from "next/link";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { ReportFilters } from "@/components/ReportFilters";
import { reportAccess } from "@/lib/report-access";
import { allRows, range } from "@/lib/report-range";

export const dynamic = "force-dynamic";

/** Purchases report: per supplier, goods received and payments in the period (SAR), what we owe now, open orders; and the goods received. */
export default async function PurchasesReport({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { t, locale } = await getDict();
  const P = t.rep;
  await reportAccess(locale, "purchasing.view");
  const sp = await searchParams;
  const { from, to } = range(sp);
  const [sups, rcs, pays, { data: orders }] = await Promise.all([
    allRows<{ id: string; name: string; balance_sar: string; open_orders: number }>((a, b) => db().from("supplier_list").select("id, name, balance_sar, open_orders").order("name").range(a, b)),
    allRows<{ id: string; supplier_id: string; order_id: string; bill_no: string | null; received_on: string; currency: string; amount: string; amount_sar: string }>((a, b) =>
      db().from("purchase_receipts").select("id, supplier_id, order_id, bill_no, received_on, currency, amount, amount_sar").gte("received_on", from).lte("received_on", to).order("received_on").range(a, b)),
    allRows<{ supplier_id: string; amount_sar: string }>((a, b) => db().from("supplier_payments").select("supplier_id, amount_sar").gte("paid_on", from).lte("paid_on", to).range(a, b)),
    db().from("purchase_orders").select("id, po_no"),
  ]);
  const poNo = new Map((orders ?? []).map((o) => [o.id, o.po_no]));
  const sum = (rows: { supplier_id: string; amount_sar: string }[], id: string) => rows.filter((r) => r.supplier_id === id).reduce((a, r) => a + Number(r.amount_sar), 0);
  const rows = sups.map((s) => ({ ...s, rec: sum(rcs, s.id), paid: sum(pays, s.id) })).filter((s) => s.rec || s.paid || Number(s.balance_sar) || s.open_orders);
  const tot = rows.reduce((a, s) => ({ rec: a.rec + s.rec, paid: a.paid + s.paid, owed: a.owed + Number(s.balance_sar) }), { rec: 0, paid: 0, owed: 0 });
  const sname = new Map(sups.map((s) => [s.id, s.name]));
  const f = (x: number) => x.toFixed(2);
  return (
    <>
      <PageHeader title={P.cards.purchases[0]} subtitle={`${from} → ${to}`} t={t} filename={`purchases-report-${from}-${to}`}>
        <Link href="/sales/reports" className="btn-ghost no-print">← {t.reports.allReports}</Link>
      </PageHeader>
      <ReportFilters t={t} action="/sales/reports/purchases" from={from} to={to} />
      <section className="card mb-6 overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{P.supplier}</h2>
        {rows.length === 0 ? <p className="px-5 pb-5 text-sm text-gray-500">{P.none}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="purchases-by-supplier">
            <thead><tr><th>{P.supplier}</th><th>{P.received}</th><th>{P.payments}</th><th>{P.owed}</th><th>{P.openOrders}</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="cell-title"><Link href={`/purchasing/suppliers/${s.id}`} className="underline">{s.name}</Link></td>
                  <td data-label={P.received} dir="ltr">{f(s.rec)}</td>
                  <td data-label={P.payments} dir="ltr">{f(s.paid)}</td>
                  <td data-label={P.owed} dir="ltr" className="font-semibold">{f(Number(s.balance_sar))}</td>
                  <td data-label={P.openOrders}>{s.open_orders}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="font-semibold"><td>{P.total}</td><td dir="ltr">{f(tot.rec)}</td><td dir="ltr">{f(tot.paid)}</td><td dir="ltr">{f(tot.owed)}</td><td></td></tr></tfoot>
          </table></div>
        )}
      </section>
      <section className="card overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{P.receipts}</h2>
        {rcs.length === 0 ? <p className="px-5 pb-5 text-sm text-gray-500">{P.none}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-export>
            <thead><tr><th>{P.day}</th><th>{P.supplier}</th><th>{t.purchasing.order}</th><th>{P.billNo}</th><th>{P.amount}</th><th>SAR</th></tr></thead>
            <tbody>
              {rcs.map((r) => (
                <tr key={r.id}>
                  <td className="cell-title" dir="ltr">{r.received_on}</td>
                  <td data-label={P.supplier}>{sname.get(r.supplier_id) ?? "—"}</td>
                  <td data-label={t.purchasing.order}><Link href={`/purchasing/${r.order_id}`} className="underline" dir="ltr">PO-{poNo.get(r.order_id)}</Link></td>
                  <td data-label={P.billNo} dir="ltr">{r.bill_no || "—"}</td>
                  <td data-label={P.amount} dir="ltr">{f(Number(r.amount))} {r.currency}</td>
                  <td data-label="SAR" dir="ltr" className="font-semibold">{f(Number(r.amount_sar))}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
