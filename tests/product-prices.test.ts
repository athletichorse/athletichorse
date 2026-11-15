import { describe, expect, it } from "vitest";
import { mapPriceSheet, saleWindow } from "@/lib/product-prices";

describe("sale price for a period", () => {
  it("needs a period and keeps from ≤ to", () => {
    expect(saleWindow("99.00", "2026-12-01", "2026-12-10")).toEqual({ sale_price: "99.00", sale_from: "2026-12-01", sale_to: "2026-12-10" });
    expect(saleWindow("99.00", "2026-12-01", "")).toEqual({ sale_price: "99.00", sale_from: "2026-12-01", sale_to: null });
    expect(saleWindow("99.00", "", "")).toBeNull();
    expect(saleWindow("99.00", "2026-12-10", "2026-12-01")).toBeNull();
    expect(saleWindow("99.00", "12/01/2026", "")).toBeNull();
    expect(saleWindow(null, "2026-12-01", "2026-12-10")).toEqual({ sale_price: null, sale_from: null, sale_to: null });
  });
});

describe("names & prices file", () => {
  it("reads English or Arabic headers, cleans money, keeps the last row per SKU", () => {
    const r = mapPriceSheet([
      ["Barcode", "اسم الصنف", "Price", "سعر الجملة", "Notes"],
      ["A-1", "حذاء", "1,250", "٩٠٠", "x"],
      ["", "skip", "1", "", ""],
      ["B-2", "", "SAR 80.5", "", ""],
      ["A-1", "حذاء ركوب", "1200", "", ""],
    ]);
    expect(r.columns).toEqual(["sku", "name_ar", "price", "wholesale"]);
    expect(r.skipped).toBe(1);
    expect(r.rows).toEqual([
      { sku: "A-1", name_ar: "حذاء ركوب", price: "1200.00" },
      { sku: "B-2", price: "80.50" },
    ]);
  });
  it("needs a SKU column", () => {
    expect(mapPriceSheet([["Name", "Price"], ["x", "1"]]).rows).toEqual([]);
  });
});
