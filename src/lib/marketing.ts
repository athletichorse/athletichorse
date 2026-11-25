/** Marketing plan: channels, and turning campaigns + Meta days into spend per channel per month. */
export const CHANNELS = ["meta", "instagram", "snapchat", "tiktok", "google", "influencer", "event", "whatsapp_sms", "print", "higgsfield", "claude", "other"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CAMPAIGN_STATUSES = ["planned", "active", "done", "cancelled"] as const;

export type Camp = { id: string; channel: string; start_on: string; spend_manual: number | string; meta_campaign_id: string | null };
export type MetaDay = { meta_campaign_id: string; day: string; spend: number | string; purchases?: number | string; purchase_value?: number | string; impressions?: number | string; clicks?: number | string; reach?: number | string };

/** Totals of the Meta days of each Meta campaign. */
export function metaTotals(days: MetaDay[]) {
  const m = new Map<string, { spend: number; impressions: number; reach: number; clicks: number; purchases: number; value: number }>();
  for (const d of days) {
    const x = m.get(d.meta_campaign_id) ?? { spend: 0, impressions: 0, reach: 0, clicks: 0, purchases: 0, value: 0 };
    x.spend += Number(d.spend); x.impressions += Number(d.impressions ?? 0); x.reach += Number(d.reach ?? 0); x.clicks += Number(d.clicks ?? 0);
    x.purchases += Number(d.purchases ?? 0); x.value += Number(d.purchase_value ?? 0);
    m.set(d.meta_campaign_id, x);
  }
  return m;
}

/** Money spent per channel per month of `year`: Meta by its days, typed spend in the campaign's start month. */
export function spendByMonth(camps: Camp[], days: MetaDay[], year: string): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const add = (ch: string, m: number, v: number) => { const a = out.get(ch) ?? (Array(12).fill(0) as number[]); a[m] += v; out.set(ch, a); };
  const chanOf = new Map(camps.filter((c) => c.meta_campaign_id).map((c) => [c.meta_campaign_id as string, c.channel]));
  for (const d of days) if (String(d.day).startsWith(year)) add(chanOf.get(d.meta_campaign_id) ?? "meta", Number(String(d.day).slice(5, 7)) - 1, Number(d.spend));
  for (const c of camps) if (Number(c.spend_manual) && String(c.start_on).startsWith(year)) add(c.channel, Number(String(c.start_on).slice(5, 7)) - 1, Number(c.spend_manual));
  for (const [k, a] of out) out.set(k, a.map((x) => Math.round(x * 100) / 100));
  return out;
}

/** Return on ad spend: purchase value ÷ spend (null when nothing spent). */
export const roas = (value: number, spend: number) => (spend > 0 ? Math.round((value / spend) * 100) / 100 : null);
