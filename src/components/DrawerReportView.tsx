import type { Dict } from "@/i18n";
import type { DrawerReport } from "@/lib/shift-report";

const f2 = (n: number) => n.toFixed(2);

/** Shift / end-of-day report body (printable: 80 mm or A4 from the print menu). */
export function DrawerReportView({ t, r, methodName, counted }: { t: Dict; r: DrawerReport; methodName: (code: string) => string; counted?: number | null }) {
  const X = t.pos.extra;
  const row = (label: string, v: string, strong = false) => (
    <div className={`flex justify-between py-1 ${strong ? "border-t border-[var(--line)] pt-2 font-semibold" : ""}`}><span className="text-gray-600">{label}</span><span dir="ltr">{v}</span></div>
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="card text-sm">
        {row(X.opening, f2(r.opening))}
        {row(`${X.sales} (${r.invoices})`, f2(r.sales))}
        {row(`${X.returnsTotal} (${r.creditNotes})`, `− ${f2(r.returns)}`)}
        {row(t.pos.cashIn, f2(r.cashIn))}
        {row(t.pos.cashOut, `− ${f2(r.cashOut)}`)}
        {r.expenses.map((e) => row(`${X.expense}: ${e.type}`, `− ${f2(e.amount)}`))}
        {row(X.customerPayment, f2(r.customerPayments))}
        {row(X.expected, f2(r.expected), true)}
        {counted !== undefined && counted !== null && row(X.counted, f2(counted))}
        {counted !== undefined && counted !== null && row(X.difference, f2(counted - r.expected), true)}
      </section>
      <section className="card text-sm">
        <h2 className="card-title">{X.byMethod}</h2>
        <table className="table" data-export>
          <thead><tr><th>{X.method}</th><th>{X.sales}</th><th>{X.returnsTotal}</th></tr></thead>
          <tbody>
            {r.byMethod.length === 0 && <tr><td colSpan={3} className="text-gray-500">{X.none}</td></tr>}
            {r.byMethod.map((m) => <tr key={m.method}><td className="cell-title">{methodName(m.method)}</td><td data-label={X.sales} dir="ltr">{f2(m.sales)}</td><td data-label={X.returnsTotal} dir="ltr">{f2(m.returns)}</td></tr>)}
          </tbody>
        </table>
      </section>
    </div>
  );
}
