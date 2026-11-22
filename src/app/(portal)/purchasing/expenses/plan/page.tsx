import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { riyadhDate } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { yearPlan, type Recurring } from "@/lib/recurring";

export const dynamic = "force-dynamic";

/** The year's expense plan: each expense × 12 months, planned (from its schedule) and paid; one-off expenses; totals. */
export default async function ExpensePlanPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  await requirePermission("purchasing.expenses");
  const { t, locale } = await getDict();
  const E = t.expenses;
  const sp = await searchParams;
  const year = /^\d{4}$/.test(sp.year ?? "") ? sp.year! : riyadhDate(new Date()).slice(0, 4);
  const [{ data: items }, { data: pays }] = await Promise.all([
    db().from("recurring_expenses").select("id, name, amount, amount_kind, frequency, due_day, start_on, end_on, active").order("name"),
    db().from("expense_payments").select("recurring_id, name, period, paid_on, amount").gte("paid_on", `${year}-01-01`).lte("paid_on", `${year}-12-31`),
  ]);
  const d10 = (v: string | null) => (v ? String(v).slice(0, 10) : null);
  type R = Recurring & { name: string; amount_kind: string };
  const rows = ((items ?? []) as R[]).map((r) => ({ ...r, start_on: d10(r.start_on)!, end_on: d10(r.end_on) }));
  const paidBy = new Map<string, number[]>();
  const others = Array(12).fill(0) as number[];
  for (const p of pays ?? []) {
    const m = Number(String(p.paid_on).slice(5, 7)) - 1;
    if (!p.recurring_id) { others[m] += Number(p.amount); continue; }
    const a = paidBy.get(p.recurring_id) ?? (Array(12).fill(0) as number[]);
    a[m] += Number(p.amount); paidBy.set(p.recurring_id, a);
  }
  const lines = rows.map((r) => ({ r, plan: r.active ? yearPlan(r, year) : Array(12).fill(0) as number[], paid: paidBy.get(r.id) ?? (Array(12).fill(0) as number[]) }))
    .filter((l) => l.plan.some(Boolean) || l.paid.some(Boolean));
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const totPlan = Array.from({ length: 12 }, (_, i) => lines.reduce((a, l) => a + l.plan[i], 0));
  const totPaid = Array.from({ length: 12 }, (_, i) => lines.reduce((a, l) => a + l.paid[i], 0) + others[i]);
  const monthName = (i: number) => new Date(Date.UTC(2000, i, 1)).toLocaleDateString(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { month: "short", timeZone: "UTC" });
  const f = (x: number) => (x ? x.toFixed(0) : "—");
  const cell = (plan: number, paid: number) => (
    <span className="block leading-tight" dir="ltr"><span className="text-gray-500">{f(plan)}</span><br /><span className={paid >= plan && paid ? "text-emerald-700 font-semibold" : paid ? "text-amber-700 font-semibold" : "text-gray-300"}>{f(paid)}</span></span>
  );
  return (
    <>
      <PageHeader title={`${E.plan} ${year}`} subtitle={E.planHint} t={t} filename={`expense-plan-${year}`}>
        <div className="no-print flex flex-wrap gap-2">
          <Link href="/purchasing/expenses" className="btn-ghost">← {E.title}</Link>
          <Link href={`/purchasing/expenses/plan?year=${Number(year) - 1}`} className="btn-ghost" dir="ltr">{Number(year) - 1}</Link>
          <Link href={`/purchasing/expenses/plan?year=${Number(year) + 1}`} className="btn-ghost" dir="ltr">{Number(year) + 1}</Link>
        </div>
      </PageHeader>
      <div className="mb-4 grid gap-3 sm:grid-cols-3" data-testid="plan-totals">
        <div className="card"><div className="text-xs text-gray-500">{E.planned}</div><div className="text-2xl font-semibold" dir="ltr">{sum(totPlan).toFixed(2)}</div></div>
        <div className="card"><div className="text-xs text-gray-500">{E.actual}</div><div className="text-2xl font-semibold" dir="ltr">{sum(totPaid).toFixed(2)}</div></div>
        <div className="card"><div className="text-xs text-gray-500">{E.left}</div><div className="text-2xl font-semibold" dir="ltr">{Math.max(0, sum(totPlan) - lines.reduce((a, l) => a + sum(l.paid), 0)).toFixed(2)}</div></div>
      </div>
      <section className="card overflow-hidden p-0">
        <p className="px-5 pt-4 text-xs text-gray-500">{E.planned} / <span className="text-emerald-700">{E.actual}</span></p>
        <div className="overflow-x-auto"><table className="table table-compact text-xs" data-export data-testid="plan-table">
          <thead><tr><th>{E.name}</th>{Array.from({ length: 12 }, (_, i) => <th key={i}>{monthName(i)}</th>)}<th>{E.total}</th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.r.id} data-plan={l.r.name}>
                <td className="cell-title">{l.r.name}{l.r.amount_kind === "variable" && <span className="text-gray-400"> ≈</span>}</td>
                {l.plan.map((p, i) => <td key={i} data-label={monthName(i)}>{cell(p, l.paid[i])}</td>)}
                <td data-label={E.total} className="font-semibold">{cell(sum(l.plan), sum(l.paid))}</td>
              </tr>
            ))}
            {others.some(Boolean) && (
              <tr><td className="cell-title">{E.others}</td>{others.map((p, i) => <td key={i} data-label={monthName(i)}>{cell(0, p)}</td>)}<td data-label={E.total} className="font-semibold">{cell(0, sum(others))}</td></tr>
            )}
          </tbody>
          <tfoot><tr className="font-semibold"><td>{E.total}</td>{totPlan.map((p, i) => <td key={i}>{cell(p, totPaid[i])}</td>)}<td>{cell(sum(totPlan), sum(totPaid))}</td></tr></tfoot>
        </table></div>
      </section>
    </>
  );
}
