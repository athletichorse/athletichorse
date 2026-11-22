import { describe, expect, it } from "vitest";
import { dueList, perMonth, periods, yearPlan, type Recurring } from "@/lib/recurring";

const rent: Recurring = { id: "r", frequency: "monthly", due_day: 5, start_on: "2026-09-01", end_on: null, active: true, amount: 3000 };
const car: Recurring = { id: "c", frequency: "quarterly", due_day: 20, start_on: "2026-08-10", end_on: "2027-02-01", active: true, amount: 1500 };

describe("recurring expenses", () => {
  it("periods by frequency, until the end date", () => {
    expect(periods(rent, "2026-11")).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"]);
    expect(periods(car, "2027-12")).toEqual(["2026-08-01", "2026-11-01", "2027-02-01"]);
  });
  it("due / overdue: unpaid periods up to a month ahead, oldest first", () => {
    const paid = new Set(["r|2026-09-01"]);
    const d = dueList([rent, car], paid, "2026-11-22");
    expect(d.map((x) => `${x.id} ${x.dueOn} ${x.overdue}`)).toEqual([
      "c 2026-08-20 true", "r 2026-10-05 true", "r 2026-11-05 true", "c 2026-11-20 true", "r 2026-12-05 false",
    ]);
  });
  it("inactive expenses are not due; monthly average", () => {
    expect(dueList([{ ...rent, active: false }], new Set(), "2026-11-22")).toEqual([]);
    expect(perMonth(car)).toBe(500);
    expect(perMonth({ amount: 12000, frequency: "yearly" })).toBe(1000);
  });
  it("occasional: once on its date; yearly plan per month", () => {
    const fee: Recurring = { id: "o", frequency: "occasional", due_day: 1, start_on: "2026-12-15", end_on: null, active: true, amount: 800 };
    expect(periods(fee, "2027-12")).toEqual(["2026-12-01"]);
    expect(dueList([fee], new Set(), "2026-11-22").map((d) => d.dueOn)).toEqual(["2026-12-15"]);
    expect(perMonth(fee)).toBe(0);
    expect(yearPlan(fee, "2026")[11]).toBe(800);
    expect(yearPlan(car, "2026")).toEqual([0, 0, 0, 0, 0, 0, 0, 1500, 0, 0, 1500, 0]);
    expect(yearPlan(rent, "2027").reduce((a, b) => a + b, 0)).toBe(36000);
  });
});
