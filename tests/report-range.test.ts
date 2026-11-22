import { describe, expect, it } from "vitest";
import { range, toBuy } from "@/lib/report-range";

describe("report helpers", () => {
  it("date range: given dates, number of days, Riyadh midnight", () => {
    const r = range({ from: "2026-11-01", to: "2026-11-30" });
    expect(r.days).toBe(30);
    expect(r.fromIso).toBe("2026-10-31T21:00:00.000Z");
    expect(range({ from: "bad" }).from).toMatch(/^\d{4}-\d{2}-01$/);
  });
  it("buy plan: sells 3/day, 60 days of stock wanted, 50 in stock → buy 130", () => {
    expect(toBuy(90, 30, 50, 60)).toEqual({ perDay: 3, daysLeft: 16, buy: 130 });
    expect(toBuy(10, 30, 500, 60).buy).toBe(0);
    expect(toBuy(0, 30, 5, 60)).toEqual({ perDay: 0, daysLeft: null, buy: 0 });
    expect(toBuy(10, 30, -4, 60).buy).toBe(20);
  });
});
