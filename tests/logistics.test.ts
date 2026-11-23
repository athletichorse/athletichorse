import { describe, expect, it } from "vitest";
import { cartons, decimal, fill } from "@/lib/logistics";

describe("logistics", () => {
  it("whole cartons and their CBM", () => {
    expect(cartons(100, { units_per_carton: 24, carton_cbm: "0.085" })).toEqual({ cartons: 5, cbm: 0.425 });
    expect(cartons(48, { units_per_carton: 24, carton_cbm: null })).toEqual({ cartons: 2, cbm: null });
    expect(cartons(10, { units_per_carton: null, carton_cbm: 1 })).toEqual({ cartons: null, cbm: null });
  });
  it("container fill", () => {
    expect(fill(33).map((c) => c.pct)).toEqual([100, 49.3, 43.4]);
  });
  it("reads numbers (Arabic digits too)", () => {
    expect(decimal("٠٫٠٨٥", 4)).toBe(0.085);
    expect(decimal("", 2)).toBeNull();
    expect(decimal("1.23456", 4)).toBeNaN();
  });
});
