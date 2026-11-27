import { describe, expect, it } from "vitest";
import { conditionShares, condError } from "@/lib/condition";

describe("item condition", () => {
  it("shares of the stock on hand", () => {
    expect(conditionShares(10, 2, 1)).toEqual({ good: 7, damagedPct: 20, partialPct: 10, badPct: 30 });
    expect(conditionShares(0, 0, 0)).toEqual({ good: 0, damagedPct: 0, partialPct: 0, badPct: 0 });
    // faulty pieces above the stock (after sales) count as all of it
    expect(conditionShares(2, 3, 0)).toEqual({ good: 0, damagedPct: 100, partialPct: 0, badPct: 100 });
  });
  it("database errors → codes", () => {
    expect(condError("ERROR: not_enough")).toBe("not_enough");
    expect(condError("bad_supplier (P0001)")).toBe("bad_supplier");
  });
});
