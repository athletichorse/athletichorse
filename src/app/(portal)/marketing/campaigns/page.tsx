import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime, riyadhDate } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { PendingButton } from "@/components/PendingButton";
import { saveCampaignAction, syncMetaAction } from "@/app/actions/marketing";
import { allRows } from "@/lib/report-range";
import { CAMPAIGN_STATUSES, metaTotals, roas, type MetaDay } from "@/lib/marketing";
import { metaConfig } from "@/lib/meta-ads";
import { CampaignFields } from "./CampaignFields";

export const dynamic = "force-dynamic";

/** Campaigns: every campaign with its budget, spend and (for Meta) reach, clicks, purchases and return. New campaigns; read from Meta. */
export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string; err?: string; meta?: string; merr?: string }> }) {
  const me = await requirePermission("marketing.view");
  const { t, locale } = await getDict();
  const M = t.mkt;
  const sp = await searchParams;
  const status = (CAMPAIGN_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status : null;
  const [{ data: camps }, days, { data: synced }] = await Promise.all([
    db().from("marketing_campaigns").select("*").order("start_on", { ascending: false }).limit(500),
    allRows<MetaDay>((a, b) => db().from("marketing_meta_daily").select("meta_campaign_id, day, spend, impressions, reach, clicks, purchases, purchase_value").range(a, b)),
    db().from("settings").select("value").eq("key", "meta_synced_at").maybeSingle(),
  ]);
  const tot = metaTotals(days);
  const rows = (camps ?? []).filter((c) => !status || c.status === status).map((c) => {
    const m = c.meta_campaign_id ? tot.get(c.meta_campaign_id) : undefined;
    const spend = (m?.spend ?? 0) + Number(c.spend_manual);
    return { ...c, m, spend };
  });
  const canEdit = me.perms.has("marketing.edit");
  const connected = Boolean(metaConfig());
  const today = riyadhDate(new Date());
  const f = (x: number) => x.toFixed(2);
  const n = (x: number) => Math.round(x).toLocaleString("en-US");
  const err = sp.err ? (M.errors as Record<string, string>)[sp.err] ?? sp.err : null;
  const [mc, md] = (sp.meta ?? "").split("-");
  return (
    <>
      <PageHeader title={M.campaigns} subtitle={M.roasHint} t={t} filename="campaigns">
        <div className="no-print flex flex-wrap gap-2">
          <Link href="/marketing" className="btn-ghost">← {M.title}</Link>
          {canEdit && connected && <form action={syncMetaAction}><PendingButton label={M.metaSync} pendingLabel={M.saving} className="btn-ghost" /></form>}
        </div>
      </PageHeader>
      {err && <p className="alert-err mb-4">{err}</p>}
      {sp.ok && <p className="alert-ok mb-4">{t.saved}</p>}
      {sp.meta && <p className="alert-ok mb-4">{M.metaDone.replace("{c}", mc ?? "0").replace("{d}", md ?? "0")}</p>}
      {sp.merr && <p className="alert-err mb-4">{sp.merr === "not_connected" ? M.metaNotConnected : sp.merr}</p>}
      {!connected && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="meta-not-connected">{M.metaNotConnected}</p>}
      {typeof synced?.value === "string" && <p className="mb-3 text-xs text-gray-500">{M.metaSynced}: {formatDateTime(new Date(synced.value), locale)}</p>}

      {canEdit && (
        <details className="card no-print mb-4" open={(camps ?? []).length === 0}>
          <summary className="cursor-pointer font-semibold" data-testid="new-campaign">+ {M.newCampaign}</summary>
          <form action={saveCampaignAction} className="mt-4 space-y-3"><CampaignFields t={t} today={today} /><div className="flex justify-end"><PendingButton label={M.save} pendingLabel={M.saving} /></div></form>
        </details>
      )}
      <div className="no-print mb-3 flex flex-wrap gap-2">
        <Link href="/marketing/campaigns" className={!status ? "btn-primary" : "btn-ghost"}>{M.all} ({(camps ?? []).length})</Link>
        {CAMPAIGN_STATUSES.map((s) => <Link key={s} href={`/marketing/campaigns?status=${s}`} className={status === s ? "btn-primary" : "btn-ghost"}>{M.statuses[s]} ({(camps ?? []).filter((c) => c.status === s).length})</Link>)}
      </div>
      <section className="card overflow-hidden p-0">
        {rows.length === 0 ? <p className="p-5 text-sm text-gray-500">{M.none}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="campaigns-table">
            <thead><tr><th>{M.name}</th><th>{M.status}</th><th>{M.budget}</th><th>{M.spent}</th><th>{M.clicks}</th><th>{M.purchases}</th><th>{M.value}</th><th>{M.roas}</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} data-campaign={c.name}>
                  <td className="cell-title"><Link href={`/marketing/campaigns/${c.id}`} className="font-medium underline">{c.name}</Link>
                    <div className="text-xs text-gray-400">{M.channels[c.channel as keyof typeof M.channels] ?? c.channel} · <span dir="ltr">{String(c.start_on).slice(0, 10)}{c.end_on ? ` → ${String(c.end_on).slice(0, 10)}` : ""}</span>{c.meta_campaign_id && <span className="badge-blue ms-1">{M.meta}</span>}</div></td>
                  <td data-label={M.status}>{M.statuses[c.status as keyof typeof M.statuses]}</td>
                  <td data-label={M.budget} dir="ltr">{Number(c.budget) ? f(Number(c.budget)) : "—"}</td>
                  <td data-label={M.spent} dir="ltr" className="font-semibold">{f(c.spend)}</td>
                  <td data-label={M.clicks} dir="ltr">{c.m ? n(c.m.clicks) : "—"}</td>
                  <td data-label={M.purchases} dir="ltr">{c.m ? n(c.m.purchases) : "—"}</td>
                  <td data-label={M.value} dir="ltr">{c.m ? f(c.m.value) : "—"}</td>
                  <td data-label={M.roas} dir="ltr" className="font-semibold">{c.m ? (roas(c.m.value, c.m.spend) ?? "—") : "—"}{c.m && roas(c.m.value, c.m.spend) !== null ? "×" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
