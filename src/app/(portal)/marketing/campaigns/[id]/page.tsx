import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { riyadhDate } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { PendingButton } from "@/components/PendingButton";
import { saveCampaignAction } from "@/app/actions/marketing";
import { allRows } from "@/lib/report-range";
import { metaTotals, roas } from "@/lib/marketing";
import { CampaignFields } from "../CampaignFields";

export const dynamic = "force-dynamic";

/** One campaign: spend, Meta results day by day, sales (till + website, before VAT) in its dates; change it. */
export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requirePermission("marketing.view");
  const { t } = await getDict();
  const M = t.mkt;
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: c } = await db().from("marketing_campaigns").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const today = riyadhDate(new Date());
  const start = String(c.start_on).slice(0, 10), end = c.end_on ? String(c.end_on).slice(0, 10) : today;
  const fromIso = new Date(`${start}T00:00:00+03:00`).toISOString(), toIso = new Date(`${end < today ? end : today}T23:59:59.999+03:00`).toISOString();
  const [{ data: days }, invs, webs] = await Promise.all([
    c.meta_campaign_id ? db().from("marketing_meta_daily").select("meta_campaign_id, day, spend, impressions, reach, clicks, purchases, purchase_value").eq("meta_campaign_id", c.meta_campaign_id).order("day") : Promise.resolve({ data: [] as never[] }),
    allRows<{ kind: string; net_total: string }>((a, b) => db().from("invoices").select("kind, net_total").gte("issued_at", fromIso).lte("issued_at", toIso).range(a, b)),
    allRows<{ total: string; tax: string }>((a, b) => db().from("web_orders").select("total, tax").is("cancelled_at", null).gte("created_at", fromIso).lte("created_at", toIso).range(a, b)),
  ]);
  const m = c.meta_campaign_id ? metaTotals(days ?? []).get(c.meta_campaign_id) : undefined;
  const spend = (m?.spend ?? 0) + Number(c.spend_manual);
  const sales = invs.reduce((a, i) => a + (i.kind === "credit_note" ? -1 : 1) * Number(i.net_total), 0) + webs.reduce((a, w) => a + Number(w.total) - Number(w.tax), 0);
  const f = (x: number) => x.toFixed(2);
  const err = sp.err ? (M.errors as Record<string, string>)[sp.err] ?? sp.err : null;
  const box = (label: string, v: string) => <div className="card"><div className="text-xs text-gray-500">{label}</div><div className="text-xl font-semibold" dir="ltr">{v}</div></div>;
  return (
    <>
      <PageHeader title={c.name} subtitle={`${M.channels[c.channel as keyof typeof M.channels] ?? c.channel} · ${M.statuses[c.status as keyof typeof M.statuses]} · ${start}${c.end_on ? ` → ${end}` : ""}`} t={t} filename="campaign">
        <Link href="/marketing/campaigns" className="btn-ghost no-print">← {M.back}</Link>
      </PageHeader>
      {err && <p className="alert-err mb-4">{err}</p>}
      {sp.ok && <p className="alert-ok mb-4">{t.saved}</p>}
      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="campaign-numbers">
        {box(M.budget, Number(c.budget) ? f(Number(c.budget)) : "—")}
        {box(M.spent, f(spend))}
        {box(M.salesInPeriod, f(sales))}
        {box(M.purchases, m ? String(m.purchases) : "—")}
        {box(M.value, m ? f(m.value) : "—")}
        {box(M.roas, m && roas(m.value, m.spend) !== null ? `${roas(m.value, m.spend)}×` : "—")}
      </div>
      {(c.goal || c.discount_code) && <p className="mb-4 text-sm">{c.goal}{c.discount_code && <span className="badge-gray ms-2" dir="ltr">{c.discount_code}</span>}</p>}
      {(days ?? []).length > 0 && (
        <section className="card mb-4 overflow-hidden p-0">
          <h2 className="card-title px-5 pt-5">{M.daily} · {M.metaFrom}</h2>
          <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="campaign-days">
            <thead><tr><th>{M.day}</th><th>{M.spent}</th><th>{M.impressions}</th><th>{M.reach}</th><th>{M.clicks}</th><th>{M.purchases}</th><th>{M.value}</th></tr></thead>
            <tbody>
              {(days ?? []).map((d) => (
                <tr key={String(d.day)}>
                  <td className="cell-title" dir="ltr">{String(d.day).slice(0, 10)}</td>
                  <td data-label={M.spent} dir="ltr">{f(Number(d.spend))}</td>
                  <td data-label={M.impressions} dir="ltr">{Number(d.impressions).toLocaleString("en-US")}</td>
                  <td data-label={M.reach} dir="ltr">{Number(d.reach).toLocaleString("en-US")}</td>
                  <td data-label={M.clicks} dir="ltr">{Number(d.clicks).toLocaleString("en-US")}</td>
                  <td data-label={M.purchases} dir="ltr">{Number(d.purchases)}</td>
                  <td data-label={M.value} dir="ltr">{f(Number(d.purchase_value))}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )}
      {me.perms.has("marketing.edit") && (
        <details className="card no-print">
          <summary className="cursor-pointer font-semibold">{M.edit}</summary>
          <form action={saveCampaignAction} className="mt-4 space-y-3"><CampaignFields t={t} c={c} today={today} /><div className="flex justify-end"><PendingButton label={M.save} pendingLabel={M.saving} /></div></form>
        </details>
      )}
    </>
  );
}
