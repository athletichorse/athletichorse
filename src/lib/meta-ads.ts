/**
 * Meta (Facebook / Instagram) ads → marketing campaigns. Read-only: campaigns and
 * their daily results from one ad account. Needs env META_ACCESS_TOKEN and
 * META_AD_ACCOUNT_ID (digits, or act_digits). Pure mapping is tested.
 */
export const META_API = "https://graph.facebook.com/v23.0";
export type MetaConfig = { token: string; account: string };

export function metaConfig(env: Record<string, string | undefined> = process.env): MetaConfig | null {
  const token = env.META_ACCESS_TOKEN?.trim();
  const acc = env.META_AD_ACCOUNT_ID?.trim().replace(/^act_/, "");
  return token && acc && /^\d{5,30}$/.test(acc) ? { token, account: `act_${acc}` } : null;
}

type Action = { action_type: string; value: string };
export type MetaInsight = { campaign_id: string; date_start: string; spend?: string; impressions?: string; reach?: string; clicks?: string; actions?: Action[]; action_values?: Action[] };
export type MetaCampaign = { id: string; name: string; effective_status?: string; status?: string; start_time?: string; stop_time?: string; lifetime_budget?: string };

const PURCHASE = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
const pick = (list: Action[] | undefined) => { for (const k of PURCHASE) { const a = list?.find((x) => x.action_type === k); if (a) return Number(a.value) || 0; } return 0; };

/** One day of one campaign, as stored. */
export function mapInsight(r: MetaInsight) {
  return {
    meta_campaign_id: r.campaign_id, day: r.date_start.slice(0, 10),
    spend: Number(r.spend ?? 0), impressions: Number(r.impressions ?? 0), reach: Number(r.reach ?? 0), clicks: Number(r.clicks ?? 0),
    purchases: Math.round(pick(r.actions)), purchase_value: Math.round(pick(r.action_values) * 100) / 100,
  };
}

/** A Meta campaign as a portal campaign (new ones; existing ones only get name/dates/status refreshed). Times are the account's local time. */
export function mapCampaign(c: MetaCampaign) {
  const s = (c.effective_status ?? c.status ?? "").toUpperCase();
  return {
    meta_campaign_id: c.id, name: c.name.slice(0, 200), channel: "meta",
    status: s === "ACTIVE" ? "active" : ["PAUSED", "ARCHIVED", "DELETED", "COMPLETED", "CAMPAIGN_PAUSED"].includes(s) ? "done" : "planned",
    start_on: (c.start_time ?? new Date().toISOString()).slice(0, 10),
    end_on: c.stop_time ? c.stop_time.slice(0, 10) : null,
    budget: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : 0,
  };
}

async function getAll<T>(url: string, fetchImpl: typeof fetch): Promise<T[]> {
  const out: T[] = [];
  let next: string | null = url;
  for (let i = 0; next && i < 50; i++) {
    const res: Response = await fetchImpl(next, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
    const body = (await res.json()) as { data?: T[]; paging?: { next?: string }; error?: { message: string } };
    if (!res.ok || body.error) throw new Error(`Meta: ${body.error?.message ?? res.status}`);
    out.push(...(body.data ?? []));
    next = body.paging?.next ?? null;
  }
  return out;
}

/** Campaigns and the daily results of the last `days` days. */
export async function fetchMeta(cfg: MetaConfig, days = 35, fetchImpl: typeof fetch = fetch, today = new Date()) {
  const until = today.toISOString().slice(0, 10);
  const since = new Date(today.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const auth = `access_token=${encodeURIComponent(cfg.token)}`;
  const campaigns = await getAll<MetaCampaign>(`${META_API}/${cfg.account}/campaigns?fields=id,name,effective_status,start_time,stop_time,lifetime_budget&limit=200&${auth}`, fetchImpl);
  const insights = await getAll<MetaInsight>(
    `${META_API}/${cfg.account}/insights?level=campaign&time_increment=1&fields=campaign_id,spend,impressions,reach,clicks,actions,action_values&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&limit=500&${auth}`, fetchImpl);
  return { campaigns: campaigns.map(mapCampaign), days: insights.map(mapInsight) };
}
