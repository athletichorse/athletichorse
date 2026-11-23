import { describe, expect, it } from "vitest";
import { fetchMeta, mapCampaign, mapInsight, metaConfig } from "@/lib/meta-ads";

describe("Meta ads", () => {
  it("config from env (act_ optional), none without a token", () => {
    expect(metaConfig({ META_ACCESS_TOKEN: "t", META_AD_ACCOUNT_ID: "123456" })).toEqual({ token: "t", account: "act_123456" });
    expect(metaConfig({ META_ACCESS_TOKEN: "t", META_AD_ACCOUNT_ID: "act_123456" })?.account).toBe("act_123456");
    expect(metaConfig({ META_AD_ACCOUNT_ID: "123456" })).toBeNull();
  });
  it("maps a day of results: purchases and their value", () => {
    expect(mapInsight({ campaign_id: "5255", date_start: "2026-11-20", spend: "120.5", impressions: "9000", reach: "7000", clicks: "300",
      actions: [{ action_type: "link_click", value: "300" }, { action_type: "omni_purchase", value: "4" }],
      action_values: [{ action_type: "omni_purchase", value: "1290.4" }] }))
      .toEqual({ meta_campaign_id: "5255", day: "2026-11-20", spend: 120.5, impressions: 9000, reach: 7000, clicks: 300, purchases: 4, purchase_value: 1290.4 });
  });
  it("maps a campaign: status and local dates", () => {
    expect(mapCampaign({ id: "1", name: "AH | Sales", effective_status: "ACTIVE", start_time: "2026-11-10T15:30:00+0300", stop_time: "2026-12-16T00:00:00+0300" }))
      .toMatchObject({ status: "active", start_on: "2026-11-10", end_on: "2026-12-16", channel: "meta" });
    expect(mapCampaign({ id: "2", name: "x", effective_status: "PAUSED" }).status).toBe("done");
  });
  it("reads every page", async () => {
    const pages: Record<string, unknown> = {
      campaigns: { data: [{ id: "1", name: "A", effective_status: "ACTIVE", start_time: "2026-11-01T00:00:00+0300" }] },
      insights: { data: [{ campaign_id: "1", date_start: "2026-11-01", spend: "10" }], paging: { next: "https://graph.facebook.com/next2" } },
      next2: { data: [{ campaign_id: "1", date_start: "2026-11-02", spend: "5" }] },
    };
    const f = (async (url: string) => new Response(JSON.stringify(url.includes("next2") ? pages.next2 : url.includes("/insights") ? pages.insights : pages.campaigns))) as unknown as typeof fetch;
    const r = await fetchMeta({ token: "t", account: "act_1" }, 30, f, new Date("2026-11-23T00:00:00Z"));
    expect(r.campaigns).toHaveLength(1);
    expect(r.days.map((d) => d.spend)).toEqual([10, 5]);
  });
});
