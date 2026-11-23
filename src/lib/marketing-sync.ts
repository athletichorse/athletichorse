import { db } from "./supabase/admin";
import { fetchMeta, metaConfig } from "./meta-ads";

export type MetaSyncResult = { ok: true; campaigns: number; days: number } | { ok: false; error: string };

/** Meta → portal: new Meta campaigns are added, existing ones refreshed (name, dates, status), daily results saved. */
export async function runMetaSync(days = 35): Promise<MetaSyncResult> {
  const cfg = metaConfig();
  if (!cfg) return { ok: false, error: "not_connected" };
  try {
    const { campaigns, days: rows } = await fetchMeta(cfg, days);
    const { data: known } = await db().from("marketing_campaigns").select("id, meta_campaign_id").not("meta_campaign_id", "is", null);
    const have = new Map((known ?? []).map((k) => [k.meta_campaign_id as string, k.id as string]));
    for (const c of campaigns) {
      const id = have.get(c.meta_campaign_id);
      if (id) await db().from("marketing_campaigns").update({ name: c.name, status: c.status, start_on: c.start_on, end_on: c.end_on, updated_at: new Date().toISOString() }).eq("id", id);
      else await db().from("marketing_campaigns").insert(c);
    }
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db().from("marketing_meta_daily").upsert(rows.slice(i, i + 500).map((r) => ({ ...r, synced_at: new Date().toISOString() })));
      if (error) throw new Error(error.message);
    }
    await db().from("settings").upsert({ key: "meta_synced_at", value: new Date().toISOString() });
    return { ok: true, campaigns: campaigns.length, days: rows.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
