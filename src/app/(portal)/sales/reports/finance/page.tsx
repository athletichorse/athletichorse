import Link from "next/link";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { riyadhDate } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { reportAccess } from "@/lib/report-access";
import { allRows } from "@/lib/report-range";
import { yearPlan, type Recurring } from "@/lib/recurring";

export const dynamic = "force-dynamic";

/** Yearly financial report: month by month, sales (till, B2B, website) and costs (purchases, salaries, expenses, cashier expenses), before VAT; expenses by type; plan vs paid. */
export default async function FinanceReport({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { t, locale } = await getDict();
  const F = t.fin;
  await reportAccess(locale, "purchasing.expenses");
  const sp = await searchParams;
  const year = /^\d{4}$/.test(sp.year ?? "") ? sp.year! : riyadhDate(new Date()).slice(0, 4);
  const fromIso = new Date(`${year}-01-01T00:00:00+03:00`).toISOString(), toIso = new Date(`${Number(year) + 1}-01-01T00:00:00+03:00`).toISOString();
  const mOf = (iso: string) => Number(new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(5, 7)) - 1; // Riyadh month
  const mOfDay = (d: string) => Number(String(d).slice(5, 7)) - 1;
  const z = () => Array(12).fill(0) as number[];
  const till = z(), b2b = z(), web = z(), buy = z(), pay = z(), exp = z(), cash = z();
  const [invs, b2bs, webs, rcs, payroll, eps, drawer, { data: types }, { data: rex }] = await Promise.all([
    allRows<{ kind: string; issued_at: string; net_total: string }>((a, b) => db().from("invoices").select("kind, issued_at, net_total").gte("issued_at", fromIso).lt("issued_at", toIso).range(a, b)),
    allRows<{ delivered_at: string; net_total: string }>((a, b) => db().from("b2b_orders").select("delivered_at, net_total").in("status", ["delivered", "invoiced"]).gte("delivered_at", fromIso).lt("delivered_at", toIso).range(a, b)),
    allRows<{ created_at: string; total: string; tax: string }>((a, b) => db().from("web_orders").select("created_at, total, tax").is("cancelled_at", null).gte("created_at", fromIso).lt("created_at", toIso).range(a, b)),
    allRows<{ received_on: string; amount_sar: string }>((a, b) => db().from("purchase_receipts").select("received_on, amount_sar").gte("received_on", `${year}-01-01`).lte("received_on", `${year}-12-31`).range(a, b)),
    allRows<{ month: string; net: string }>((a, b) => db().from("payroll_lines").select("month, net").gte("month", `${year}-01-01`).lte("month", `${year}-12-01`).range(a, b)),
    allRows<{ paid_on: string; amount: string; expense_type_id: string | null }>((a, b) => db().from("expense_payments").select("paid_on, amount, expense_type_id").gte("paid_on", `${year}-01-01`).lte("paid_on", `${year}-12-31`).range(a, b)),
    allRows<{ created_at: string; amount: string; expense_type_id: string | null }>((a, b) => db().from("drawer_entries").select("created_at, amount, expense_type_id").eq("kind", "expense").gte("created_at", fromIso).lt("created_at", toIso).range(a, b)),
    db().from("expense_types").select("id, name_en, name_ar"),
    db().from("recurring_expenses").select("id, frequency, due_day, start_on, end_on, active, amount"),
  ]);
  for (const i of invs) till[mOf(i.issued_at)] += (i.kind === "credit_note" ? -1 : 1) * Number(i.net_total);
  for (const o of b2bs) b2b[mOf(o.delivered_at)] += Number(o.net_total);
  for (const o of webs) web[mOf(o.created_at)] += Number(o.total) - Number(o.tax);
  for (const r of rcs) buy[mOfDay(r.received_on)] += Number(r.amount_sar);
  const { data: months } = await db().from("payroll_months").select("month, status").in("status", ["approved", "paid"]);
  const counted = new Set((months ?? []).map((m) => String(m.month).slice(0, 7)));
  for (const p of payroll) if (counted.has(String(p.month).slice(0, 7))) pay[mOfDay(p.month)] += Number(p.net);
  for (const e of eps) exp[mOfDay(e.paid_on)] += Number(e.amount);
  for (const d of drawer) cash[mOf(d.created_at)] += Number(d.amount);
  const byType = new Map<string, number>();
  for (const e of [...eps, ...drawer]) byType.set(e.expense_type_id ?? "", (byType.get(e.expense_type_id ?? "") ?? 0) + Number(e.amount));
  const tname = (id: string) => { const x = types?.find((y) => y.id === id); return x ? (locale === "ar" && x.name_ar) || x.name_en : F.other; };
  const planned = ((rex ?? []) as Recurring[]).filter((r) => r.active).map((r) => yearPlan({ ...r, start_on: String(r.start_on).slice(0, 10), end_on: r.end_on ? String(r.end_on).slice(0, 10) : null }, year)).reduce((a, p) => a.map((x, i) => x + p[i]), z());
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const sales = till.map((x, i) => x + b2b[i] + web[i]);
  const costs = buy.map((x, i) => x + pay[i] + exp[i] + cash[i]);
  const f = (x: number) => x.toFixed(2);
  const monthName = (i: number) => new Date(Date.UTC(2000, i, 1)).toLocaleDateString(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { month: "long", timeZone: "UTC" });
  const cols: [string, number[], string?][] = [[F.till, till], [F.b2b, b2b], [F.web, web], [F.sales, sales, "font-semibold"], [F.purchases, buy], [F.salaries, pay], [F.expenses, exp], [F.cashier, cash], [F.costs, costs, "font-semibold"]];
  return (
    <>
      <PageHeader title={`${F.title} ${year}`} subtitle={F.hint} t={t} filename={`financial-${year}`}>
        <div className="no-print flex flex-wrap gap-2">
          <Link href="/sales/reports" className="btn-ghost">← {t.reports.allReports}</Link>
          <Link href={`/sales/reports/finance?year=${Number(year) - 1}`} className="btn-ghost" dir="ltr">{Number(year) - 1}</Link>
          <Link href={`/sales/reports/finance?year=${Number(year) + 1}`} className="btn-ghost" dir="ltr">{Number(year) + 1}</Link>
        </div>
      </PageHeader>
      <div className="mb-4 grid gap-3 sm:grid-cols-3" data-testid="finance-totals">
        <div className="card"><div className="text-xs text-gray-500">{F.sales}</div><div className="text-2xl font-semibold" dir="ltr">{f(sum(sales))}</div></div>
        <div className="card"><div className="text-xs text-gray-500">{F.costs}</div><div className="text-2xl font-semibold" dir="ltr">{f(sum(costs))}</div></div>
        <div className="card"><div className="text-xs text-gray-500">{F.left}</div><div className={`text-2xl font-semibold ${sum(sales) - sum(costs) < 0 ? "text-red-700" : "text-emerald-700"}`} dir="ltr">{f(sum(sales) - sum(costs))}</div></div>
      </div>
      <section className="card mb-6 overflow-hidden p-0">
        <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="finance-table">
          <thead><tr><th>{F.month}</th>{cols.map(([h]) => <th key={h}>{h}</th>)}<th>{F.left}</th></tr></thead>
          <tbody>
            {Array.from({ length: 12 }, (_, i) => (
              <tr key={i}>
                <td className="cell-title">{monthName(i)}</td>
                {cols.map(([h, a, cls]) => <td key={h} data-label={h} dir="ltr" className={cls}>{f(a[i])}</td>)}
                <td data-label={F.left} dir="ltr" className={`font-semibold ${sales[i] - costs[i] < 0 ? "text-red-700" : ""}`}>{f(sales[i] - costs[i])}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="font-semibold"><td>{F.total}</td>{cols.map(([h, a]) => <td key={h} dir="ltr">{f(sum(a))}</td>)}<td dir="ltr">{f(sum(sales) - sum(costs))}</td></tr></tfoot>
        </table></div>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card overflow-hidden p-0">
          <h2 className="card-title px-5 pt-5">{F.byType}</h2>
          <table className="table table-compact"><tbody>
            {[...byType.entries()].sort((a, b) => b[1] - a[1]).map(([id, v]) => <tr key={id || "none"}><td className="cell-title">{tname(id)}</td><td dir="ltr" className="font-semibold">{f(v)}</td></tr>)}
            {byType.size === 0 && <tr><td className="text-sm text-gray-500">—</td></tr>}
          </tbody></table>
        </section>
        <section className="card overflow-hidden p-0">
          <h2 className="card-title px-5 pt-5">{F.vsPlan}</h2>
          <table className="table table-compact"><tbody>
            <tr><td className="cell-title">{F.plan}</td><td dir="ltr" className="font-semibold">{f(sum(planned))}</td></tr>
            <tr><td className="cell-title">{F.expenses}</td><td dir="ltr" className="font-semibold">{f(sum(exp))}</td></tr>
          </tbody></table>
          <p className="px-5 pb-4 text-xs"><Link href={`/purchasing/expenses/plan?year=${year}`} className="underline">{t.expenses.openPlan}</Link></p>
        </section>
      </div>
    </>
  );
}
