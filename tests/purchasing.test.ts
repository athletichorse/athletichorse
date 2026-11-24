import { describe, expect, it } from "vitest";
import { b2bNext, b2bTotals, errCode, latin, num, withRunning } from "@/lib/purchasing";

describe("purchasing + B2B rules", () => {
  it("reads Arabic digits and checks numbers", () => {
    expect(latin("١٢٫٥")).toBe("12.5");
    expect(num("1,000", 2)).toBe("1000");
    expect(num("0", 2)).toBeNull();
    expect(num("0", 4, true)).toBe("0");
    expect(num("1.23456", 4)).toBeNull();
    expect(num("abc", 2)).toBeNull();
    expect(num("50", 0)).toBe("50");
    expect(num("2.5", 0)).toBeNull();
  });
  it("B2B totals match the database (prices include VAT, per line)", () => {
    // 2 × 115 with 10% off = 207.00 → 180.00 + 27.00 VAT
    expect(b2bTotals([{ qty: "2", price: "115", discount: "10" }], 15)).toEqual({ gross: 207, net: 180, vat: 27 });
    expect(b2bTotals([{ qty: "1", price: "10", discount: "" }, { qty: "3", price: "1.15", discount: "0" }], 15)).toEqual({ gross: 13.45, net: 11.7, vat: 1.75 });
  });
  it("stages only move forward; delivered can only be invoiced", () => {
    expect(b2bNext("new")).toEqual(["in_production", "ready", "delivered", "cancelled"]);
    expect(b2bNext("delivered")).toEqual(["invoiced"]);
    expect(b2bNext("invoiced")).toEqual([]);
    expect(b2bNext("cancelled")).toEqual([]);
  });
  it("running balance and error codes", () => {
    expect(withRunning([{ amount: 4000 }, { amount: -1000 }]).map((r) => r.balance)).toEqual([4000, 3000]);
    expect(errCode("ERROR: too_many", ["too_many"])).toBe("too_many");
    expect(errCode('duplicate key value violates unique constraint "suppliers_name_uq"', [])).toBe("duplicate");
  });
});
