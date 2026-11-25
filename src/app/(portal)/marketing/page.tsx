import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { riyadhDate } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { PendingButton } from "@/components/PendingButton";
import { saveBudgetAction } from "@/app/actions/marketing";
import { allRows } from "@/lib/report-range";
import { CHANNELS, spendByMonth, type Camp, type MetaDay } from "@/lib/marketing";

export const dynamic = "force-dynamic";

/** Marketing plan for a year: budget per channel per month (editable), what was spent, and marketing as a share of sales. */
export default async function MarketingPlan({ searchParams }: { searchParams: Promise<{ year?: string; ok?: string; err?: string }> }) {
  const me = await requirePermission("marketing.view");
  const { t, locale } = await getDict();
  const M = t.mkt;
  const sp = await searchParams;
  const year = /^\d{4}$/.test(sp.year ?? "") ? sp.year! : riyadhDate(new Date()).slice(0, 4);
  const fromIso = new Date(`${year}-01-01T00:00:00+03:00`).toISOString(), toIso = new Date(`${Number(year) + 1}-01-01T00:00:00+03:00`).toISOString();
  const [{ data: budget }, { data: camps }, days, invs, webs] = await Promise.all([
    db().from("marketing_budget").select("month, channel, amount").eq("year", Number(year)),
    db().from("marketing_campaigns").select("id, channel, start_on, spend_manual, meta_campaign_id").neq("status", "cancelled"),
    allRows<MetaDay>((a, b) => db().from("marketing_meta_daily").select("meta_campaign_id, day, spend").gte("day", `${year}-01-01`).lte("day", `${year}-12-31`).range(a, b)),
    allRows<{ kind: string; issued_at: string; net_total: string }>((a, b) => db().from("invoices").select("kind, issued_at, net_total").gte("issued_at", fromIso).lt("issued_at", toIso).range(a, b)),
    allRows<{ created_at: string; total: string; tax: string }>((a, b) => db().from("web_orders").select("created_at, total, tax").is("cancelled_at", null).gte("created_at", fromIso).lt("created_at", toIso).range(a, b)),
  ]);
  const plan = new Map<string, number[]>();
  for (const b of budget ?? []) { const a = plan.get(b.channel) ?? (Array(12).fill(0) as number[]); a[b.month - 1] = Number(b.amount); plan.set(b.channel, a); }
  const spent = spendByMonth(((camps ?? []) as Camp[]).map((c) => ({ ...c, start_on: String(c.start_on).slice(0, 10) })), days.map((d) => ({ ...d, day: String(d.day).slice(0, 10) })), year);
  const mOf = (iso: string) => Number(new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(5, 7)) - 1;
  const sales = Array(12).fill(0) as number[];
  for (const i of invs) sales[mOf(i.issued_at)] += (i.kind === "credit_note" ? -1 : 1) * Number(i.net_total);
  for (const w of webs) sales[mOf(w.created_at)] += Number(w.total) - Number(w.tax);
  const z = () => Array(12).fill(0) as number[];
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const planTot = CHANNELS.reduce((acc, ch) => acc.map((x, i) => x + (plan.get(ch)?.[i] ?? 0)), z());
  const spentTot = [...spent.values()].reduce((acc, a) => acc.map((x, i) => x + a[i]), z());
  const monthName = (i: number) => new Date(Date.UTC(2000, i, 1)).toLocaleDateString(locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { month: "short", timeZone: "UTC" });
  const f0 = (x: number) => (x ? x.toFixed(0) : "—");
  const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");
  const canEdit = me.perms.has("marketing.edit");
  const err = sp.err ? (M.errors as Record<string, string>)[sp.err] ?? sp.err : null;
  return (
    <>
      <PageHeader title={`${M.title} ${year}`} subtitle={M.subtitle} t={t} filename={`marketing-plan-${year}`}>
        <div className="no-print flex flex-wrap gap-2">
          <Link href={`/marketing?year=${Number(year) - 1}`} className="btn-ghost" dir="ltr">{Number(year) - 1}</Link>
          <Link href={`/marketing?year=${Number(year) + 1}`} className="btn-ghost" dir="ltr">{Number(year) + 1}</Link>
          <Link href="/marketing/campaigns" className="btn-primary">{M.campaigns}</Link>
        </div>
      </PageHeader>
      {err && <p className="alert-err mb-4">{err}</p>}
      {sp.ok && <p className="alert-ok mb-4">{t.saved}</p>}
      <div className="mb-4 grid gap-3 sm:grid-cols-4" data-testid="mkt-totals">
        <div className="card"><div className="text-xs text-gray-500">{M.budget}</div><div className="text-2xl font-semibold" dir="ltr">{sum(planTot).toFixed(2)}</div></div>
        <div className="card"><div className="text-xs text-gray-500">{M.spent}</div><div className="text-2xl font-semibold" dir="ltr">{sum(spentTot).toFixed(2)}</div></div>
        <div className="card"><div className="text-xs text-gray-500">{M.left}</div><div className={`text-2xl font-semibold ${sum(planTot) - sum(spentTot) < 0 ? "text-red-700" : ""}`} dir="ltr">{(sum(planTot) - sum(spentTot)).toFixed(2)}</div></div>
        <div className="card"><div className="text-xs text-gray-500">{M.share}</div><div className="text-2xl font-semibold" dir="ltr">{pct(sum(spentTot), sum(sales))}</div></div>
      </div>
      <p className="mb-2 text-xs text-gray-500">{M.planHint}</p>
      <form action={saveBudgetAction} className="card overflow-hidden p-0">
        <input type="hidden" name="year" value={year} />
        <div className="overflow-x-auto"><table className="table table-compact text-xs" data-export data-testid="mkt-plan">
          <thead><tr><th>{M.channel}</th>{Array.from({ length: 12 }, (_, i) => <th key={i} className="!px-1">{monthName(i)}</th>)}<th>{M.total}</th></tr></thead>
          <tbody>
            {CHANNELS.map((ch) => {
              const p = plan.get(ch) ?? z(), s = spent.get(ch) ?? z();
              return (
                <tr key={ch} data-channel={ch}>
                  <td className="cell-title w-28 text-xs">{M.channels[ch]}</td>
                  {p.map((v, i) => (
                    <td key={i} data-label={monthName(i)} className="!px-1">
                      {canEdit ? <input name={`b:${ch}:${i + 1}`} defaultValue={v ? String(v) : ""} className="input w-14 px-1 py-1 text-xs" dir="ltr" inputMode="decimal" aria-label={`${M.budget} ${M.channels[ch]} ${monthName(i)}`} /> : <span dir="ltr">{f0(v)}</span>}
                      <div className={`mt-0.5 ${s[i] > v && v ? "text-red-700" : "text-gray-500"}`} dir="ltr">{s[i] ? s[i].toFixed(0) : ""}</div>
                    </td>
                  ))}
                  <td data-label={M.total} dir="ltr" className="font-semibold">{f0(sum(p))}<div className="text-gray-500">{f0(sum(s))}</div></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold"><td>{M.budget}</td>{planTot.map((v, i) => <td key={i} dir="ltr">{f0(v)}</td>)}<td dir="ltr">{f0(sum(planTot))}</td></tr>
            <tr className="font-semibold"><td>{M.spent}</td>{spentTot.map((v, i) => <td key={i} dir="ltr">{f0(v)}</td>)}<td dir="ltr">{f0(sum(spentTot))}</td></tr>
            <tr><td>{M.sales}</td>{sales.map((v, i) => <td key={i} dir="ltr">{f0(v)}</td>)}<td dir="ltr">{f0(sum(sales))}</td></tr>
            <tr><td>{M.share}</td>{sales.map((v, i) => <td key={i} dir="ltr">{pct(spentTot[i], v)}</td>)}<td dir="ltr">{pct(sum(spentTot), sum(sales))}</td></tr>
          </tfoot>
        </table></div>
        {canEdit && <div className="no-print flex justify-end p-4"><PendingButton label={M.saveBudget} pendingLabel={M.saving} /></div>}
      </form>
    </>
  );
}
