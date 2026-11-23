import { describe, expect, it } from "vitest";
import { metaTotals, roas, spendByMonth } from "@/lib/marketing";

describe("marketing plan", () => {
  const camps = [
    { id: "a", channel: "meta", start_on: "2026-11-10", spend_manual: 0, meta_campaign_id: "1" },
    { id: "b", channel: "influencer", start_on: "2026-12-01", spend_manual: 2500, meta_campaign_id: null },
  ];
  const days = [
    { meta_campaign_id: "1", day: "2026-11-30", spend: 100, purchases: 2, purchase_value: 600 },
    { meta_campaign_id: "1", day: "2026-12-01", spend: 50, purchases: 1, purchase_value: 150 },
    { meta_campaign_id: "1", day: "2025-12-01", spend: 999 },
  ];
  it("spend per channel per month (Meta by day, typed spend in the start month)", () => {
    const m = spendByMonth(camps, days, "2026");
    expect(m.get("meta")?.slice(10)).toEqual([100, 50]);
    expect(m.get("influencer")?.[11]).toBe(2500);
  });
  it("Meta totals and ROAS", () => {
    const t = metaTotals(days.slice(0, 2)).get("1")!;
    expect(t).toMatchObject({ spend: 150, purchases: 3, value: 750 });
    expect(roas(t.value, t.spend)).toBe(5);
    expect(roas(10, 0)).toBeNull();
  });
});
