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

import { levelForHeader, mapPriceSheet as mapSheet2 } from "@/lib/product-prices";
describe("prices file: one column per price level", () => {
  const levels = [{ id: "vip", names: ["VIP", "كبار العملاء"] }, { id: "dist", names: ["Distributor", "موزع"] }];
  it("finds a level by its name, 'X price', 'price X' or 'سعر X'", () => {
    expect(levelForHeader("VIP", levels)).toBe("vip");
    expect(levelForHeader("vip price", levels)).toBe("vip");
    expect(levelForHeader("سعر كبار العملاء", levels)).toBe("vip");
    expect(levelForHeader("Price  Distributor", levels)).toBe("dist");
    expect(levelForHeader("Retail", levels)).toBeNull();
  });
  it("reads each level column; empty cells change nothing; wholesale keeps its own column", () => {
    const m = mapSheet2([
      ["Barcode", "Price", "سعر الجملة", "VIP", "سعر موزع"],
      ["A1", "35", "28", "30", ""],
      ["B2", "", "", "١٢٫٥٠".replace("٫", "."), "10"],
    ], levels);
    expect(m.levelColumns).toEqual(["vip", "dist"]);
    expect(m.rows[0]).toEqual({ sku: "A1", price: "35.00", wholesale: "28.00", levels: { vip: "30.00" } });
    expect(m.rows[1]).toEqual({ sku: "B2", levels: { vip: "12.50", dist: "10.00" } });
  });
});

describe("prices file: header row and column names as people write them", () => {
  it("finds the header row below a title and blank rows; Arabic names with alef variants and colons", () => {
    const m = mapSheet2([
      ["قائمة الأسعار - فرع جدة"],
      [],
      ["كود الصنف:", "اسم الصنف", "سعر البيع", "سعر الشراء"],
      [100100, "حبل", "35", "12"],
      ["100200.0", "كرة", "٢٠", ""],
    ]);
    expect(m.columns).toEqual(expect.arrayContaining(["sku", "name_ar", "price", "cost"]));
    expect(m.rows[0]).toEqual({ sku: "100100", name_ar: "حبل", price: "35.00", cost: "12.00" });
    expect(m.rows[1]).toMatchObject({ sku: "100200", price: "20.00" });
  });
  it("accepts Item code / الباركود (SKU)", () => {
    expect(mapSheet2([["Item code", "Price"], ["A1", "5"]]).rows).toEqual([{ sku: "A1", price: "5.00" }]);
    expect(mapSheet2([["الباركود (SKU)", "السعر"], ["B2", "7"]]).rows).toEqual([{ sku: "B2", price: "7.00" }]);
  });
});

describe("prices file: the owner's export", () => {
  it("reads 'الباركود / الرقم', 'الصنف', 'سعر الشراء', 'سعر البيع' and skips the other columns", () => {
    const m = mapSheet2([
      ["الباركود / الرقم", "الصنف", "وحدة اساسية", "المجموعة", "النوع /مجموعة", "سعر الشراء", "سعر البيع"],
      [461559, "ستارز شراب اديداس شبابي منقط", "قطعة", "أحذية", "حذاء كرة", 500, "900.00"],
      [312513, "شنطه هانديانج تراك فوسفوري صغيره 37", "قطعة", "أدوات", "شنطة", 125, "195.00"],
    ]);
    expect(m.columns).toEqual(expect.arrayContaining(["sku", "name_ar", "price", "cost"]));
    expect(m.rows[0]).toEqual({ sku: "461559", name_ar: "ستارز شراب اديداس شبابي منقط", price: "900.00", cost: "500.00" });
    expect(m.rows[1]).toMatchObject({ sku: "312513", price: "195.00", cost: "125.00" });
  });
});
