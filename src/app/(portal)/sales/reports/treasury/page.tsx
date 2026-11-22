import Link from "next/link";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { riyadhDate } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { ReportFilters } from "@/components/ReportFilters";
import { reportAccess } from "@/lib/report-access";
import { allRows } from "@/lib/report-range";
import { riyadhDay } from "@/lib/report-calc";

export const dynamic = "force-dynamic";
type SP = { month?: string; loc?: string };

const monthRange = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  return { fromIso: new Date(`${m}-01T00:00:00+03:00`).toISOString(), toIso: new Date(`${next}-01T00:00:00+03:00`).toISOString() };
};

/** Treasury: each day of the month (expected vs counted cash at closing, the difference), and money taken per branch by payment method vs last year. */
export default async function TreasuryReport({ searchParams }: { searchParams: Promise<SP> }) {
  const { t, locale } = await getDict();
  const P = t.rep;
  const { view, branches, name } = await reportAccess(locale);
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : riyadhDate(new Date()).slice(0, 7);
  const lastYear = `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`;
  const loc = view.find((l) => l.id === sp.loc)?.id;
  const locIds = loc ? [loc] : view.map((l) => l.id);
  const none = ["00000000-0000-0000-0000-000000000000"];
  const cur = monthRange(month), prev = monthRange(lastYear);

  const shifts = await allRows<{ closed_at: string; expected_cash: string | null; counted_cash: string | null; difference: string | null }>((a, b) =>
    db().from("pos_shifts").select("closed_at, expected_cash, counted_cash, difference").eq("status", "closed").gte("closed_at", cur.fromIso).lt("closed_at", cur.toIso).in("location_id", locIds.length ? locIds : none).range(a, b));
  const days = new Map<string, { n: number; exp: number; cnt: number; diff: number }>();
  for (const s of shifts) {
    const d = riyadhDay(s.closed_at);
    const x = days.get(d) ?? { n: 0, exp: 0, cnt: 0, diff: 0 };
    x.n++; x.exp += Number(s.expected_cash ?? 0); x.cnt += Number(s.counted_cash ?? 0); x.diff += Number(s.difference ?? 0);
    days.set(d, x);
  }
  const dayRows = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dt = dayRows.reduce((a, [, x]) => ({ n: a.n + x.n, exp: a.exp + x.exp, cnt: a.cnt + x.cnt, diff: a.diff + x.diff }), { n: 0, exp: 0, cnt: 0, diff: 0 });

  // money taken per branch and payment method (returns count negative)
  async function takings(r: { fromIso: string; toIso: string }) {
    const invs = await allRows<{ id: string; kind: string; location_id: string }>((a, b) =>
      db().from("invoices").select("id, kind, location_id").gte("issued_at", r.fromIso).lt("issued_at", r.toIso).in("location_id", locIds.length ? locIds : none).range(a, b));
    const inv = new Map(invs.map((i) => [i.id, i]));
    const m = new Map<string, number>(); // `${loc}|${method}`
    const ids = invs.map((i) => i.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db().from("invoice_payments").select("invoice_id, method, amount").in("invoice_id", ids.slice(i, i + 200));
      for (const p of data ?? []) {
        const v = inv.get(p.invoice_id)!;
        const k = `${v.location_id}|${p.method}`;
        m.set(k, (m.get(k) ?? 0) + (v.kind === "credit_note" ? -1 : 1) * Number(p.amount));
      }
    }
    return m;
  }
  const [now, before, { data: methods }] = await Promise.all([takings(cur), takings(prev), db().from("payment_methods").select("code, name_en, name_ar").order("sort")]);
  const used = (methods ?? []).filter((m) => [...now.keys(), ...before.keys()].some((k) => k.endsWith(`|${m.code}`)));
  const locsUsed = view.filter((l) => [...now.keys(), ...before.keys()].some((k) => k.startsWith(`${l.id}|`)));
  const cell = (m: Map<string, number>, l: string, c?: string) => [...m.entries()].filter(([k]) => k.startsWith(`${l}|`) && (!c || k.endsWith(`|${c}`))).reduce((a, [, v]) => a + v, 0);
  const pct = (a: number, b: number) => (b ? `${(((a - b) / Math.abs(b)) * 100).toFixed(1)}%` : "—");
  const f = (x: number) => x.toFixed(2);
  return (
    <>
      <PageHeader title={P.cards.treasury[0]} subtitle={month} t={t} filename={`treasury-${month}`}>
        <Link href="/sales/reports" className="btn-ghost no-print">← {t.reports.allReports}</Link>
      </PageHeader>
      <ReportFilters t={t} action="/sales/reports/treasury" loc={loc} branches={branches}>
        <div><label className="label" htmlFor="tr-month">{P.month}</label><input id="tr-month" type="month" name="month" defaultValue={month} className="input" dir="ltr" /></div>
      </ReportFilters>
      <section className="card mb-6 overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{P.cards.treasury[0]}</h2>
        {dayRows.length === 0 ? <p className="px-5 pb-5 text-sm text-gray-500">{P.noShifts}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="treasury-days">
            <thead><tr><th>{P.day}</th><th>{P.shifts}</th><th>{P.expected}</th><th>{P.counted}</th><th>{P.difference}</th></tr></thead>
            <tbody>
              {dayRows.map(([d, x]) => (
                <tr key={d}>
                  <td className="cell-title" dir="ltr">{d}</td>
                  <td data-label={P.shifts}>{x.n}</td>
                  <td data-label={P.expected} dir="ltr">{f(x.exp)}</td>
                  <td data-label={P.counted} dir="ltr">{f(x.cnt)}</td>
                  <td data-label={P.difference} dir="ltr" className={x.diff < 0 ? "text-red-700 font-semibold" : x.diff > 0 ? "text-amber-700 font-semibold" : ""}>{f(x.diff)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="font-semibold"><td>{P.total}</td><td>{dt.n}</td><td dir="ltr">{f(dt.exp)}</td><td dir="ltr">{f(dt.cnt)}</td><td dir="ltr">{f(dt.diff)}</td></tr></tfoot>
          </table></div>
        )}
      </section>
      <section id="collections" className="card overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{P.cards.collections[0]} · {month} / {lastYear}</h2>
        {locsUsed.length === 0 ? <p className="px-5 pb-5 text-sm text-gray-500">{P.none}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="collections-month">
            <thead><tr><th>{P.branch}</th>{used.map((m) => <th key={m.code}>{(locale === "ar" && m.name_ar) || m.name_en}</th>)}<th>{P.total}</th><th>{P.lastYear}</th><th>{P.change}</th></tr></thead>
            <tbody>
              {locsUsed.map((l) => {
                const tot = cell(now, l.id), ly = cell(before, l.id);
                return (
                  <tr key={l.id}>
                    <td className="cell-title">{name(l.id)}</td>
                    {used.map((m) => <td key={m.code} data-label={(locale === "ar" && m.name_ar) || m.name_en} dir="ltr">{f(cell(now, l.id, m.code))}</td>)}
                    <td data-label={P.total} dir="ltr" className="font-semibold">{f(tot)}</td>
                    <td data-label={P.lastYear} dir="ltr">{f(ly)}</td>
                    <td data-label={P.change} dir="ltr" className={tot >= ly ? "text-emerald-700" : "text-red-700"}>{pct(tot, ly)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
