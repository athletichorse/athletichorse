import { describe, expect, it } from "vitest";
import { convertPrice, mapSheet, scrubBrand } from "@/lib/product-import";

const H = ["SKU", "Name (Arabic)", "Name (English)", "English name from", "Group (المجموعة)", "Type (النوع)", "Unit", "Barcode", "Extra codes", "Sale price (EGP)", "Active", "Service (no stock)", "Model code", "Colour", "Size", "Total stock", "Stock · Maadi Branch", "Main image", "All images", "Website title"];

describe("price conversion (13 EGP = 1.8 SAR, whole riyals)", () => {
  const rate = { from: "13", to: "1.8", whole: true };
  it.each([
    ["180", "25.00"], // 24.92
    ["340", "47.00"], // 47.08
    ["500", "69.00"], // 69.23
    ["35", "5.00"],   // 4.85
    ["52.5", "7.00"], // 7.27
    ["0", "0.00"],
  ])("%s EGP → %s SAR", (egp, sar) => expect(convertPrice(egp, rate)).toBe(sar));
  it("rounds half up", () => expect(convertPrice("65", { from: "13", to: "1.7", whole: true })).toBe("9.00")); // 8.5
  it("keeps halalas when not whole", () => expect(convertPrice("180", { ...rate, whole: false })).toBe("24.92"));
  it("no price stays empty", () => {
    expect(convertPrice(null, rate)).toBeNull();
    expect(convertPrice("abc", rate)).toBeNull();
  });
  it("same currency, rate 1:1", () => expect(convertPrice("49.99", { from: "1", to: "1", whole: false })).toBe("49.99"));
  it("rejects a zero rate", () => expect(() => convertPrice("10", { from: "0", to: "1", whole: true })).toThrow());
});

describe("brand", () => {
  const others = ["Acme Sports", "أكمي"];
  it("replaces another brand name with ours (English and Arabic)", () => {
    expect(scrubBrand("ACME  sports Goggles", others)).toBe("Alhisan Alriyadi Goggles");
    expect(scrubBrand("acme-sports bag", others)).toBe("Alhisan Alriyadi bag");
    expect(scrubBrand("نظارة أكمي", others)).toBe("نظارة الحصان الرياضي");
  });
  it("changes nothing without a list", () => expect(scrubBrand("Acme Sports")).toBe("Acme Sports"));
});

describe("mapSheet", () => {
  const sheet = [
    H,
    ["172004", "نظارة سباحة", null, null, "أدوات", null, "قطعة", null, "#172004, 172004##", 180, "Yes", "No", null, null, null, 5, 5, "https://cdn.shopify.com/a.png", "https://cdn.shopify.com/a.png https://cdn.shopify.com/b.png", "Swim Goggles"],
    ["#172004#172005", "طقم", "Set", null, "NONE", null, null, null, null, null, "Yes", "No", null, null, null, 0, 0, null, null, null],
    ["239901-01", "برنس - احمر - Big", null, null, "ملابس", null, null, null, null, 100, "Yes", "No", "239901", "احمر", "Big", 0, 0, null, null, null],
    ["has space", "بند", null, null, null, null, null, null, null, 10, "Yes", "Yes", null, null, null, 0, 0, null, null, null],
    ["", "no sku", null, null, null, null, null, null, null, 10, "Yes", "No", null, null, null, 0, 0, null, null, null],
  ];
  const m = mapSheet(sheet);
  it("detects currency and ignores stock columns", () => {
    expect(m.currency).toBe("EGP");
    expect(m.ignoredStockColumns).toBe(2);
    expect(m.rows).toHaveLength(4);
    expect(m.skipped).toBe(1);
  });
  it("maps a normal row", () => {
    expect(m.rows[0]).toMatchObject({
      ref: "172004", sku: "172004", name_ar: "نظارة سباحة", name_en: "Swim Goggles", group_ar: "أدوات", group_en: "Equipment",
      unit: "piece", codes: ["#172004", "172004##"], price_src: "180", active: true, service: false,
      images: ["https://cdn.shopify.com/a.png", "https://cdn.shopify.com/b.png"],
    });
  });
  it("keeps # codes, drops NONE groups and missing prices", () => {
    expect(m.rows[1]).toMatchObject({ sku: "#172004#172005", group_ar: "", price_src: null });
  });
  it("keeps model / colour / size", () => expect(m.rows[2]).toMatchObject({ model: "239901", option1: "احمر", option2: "Big" }));
  it("a SKU of only punctuation is not a barcode", () => {
    const r = mapSheet([H, [".", "حذاء", null, null, null, null, null, null, null, 10, "Yes", "No", null, null, null, 0, 0, null, null, null]]).rows[0];
    expect(r).toMatchObject({ ref: ".", sku: null });
  });
  it("an SKU with a space is kept as the reference but not as a barcode", () => expect(m.rows[3]).toMatchObject({ ref: "has space", sku: null, service: true }));
});
