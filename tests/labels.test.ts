import { describe, expect, it } from "vitest";
import { LABEL_PRESETS, labelsDocument, normalizeSettings } from "@/lib/labels";

const item = { sku: "RB-42", name: "Riding <boots>", options: "Black / 42", price: "350.00", qty: 3 };

describe("barcode labels", () => {
  it("has the Zebra 40×25 and Xprinter 38×25 presets", () => {
    expect(LABEL_PRESETS.zebra).toEqual({ w: 40, h: 25 });
    expect(LABEL_PRESETS.xprinter).toEqual({ w: 38, h: 25 });
  });
  it("prints one page per sticker at the chosen size", () => {
    const { html, count } = labelsDocument([item, { ...item, sku: "RG-M", qty: 2 }], { w: 40, h: 25 });
    expect(count).toBe(5);
    expect(html).toContain("@page{size:40mm 25mm;margin:0}");
    expect(html.match(/class="pg"/g)).toHaveLength(5);
    expect(html).toContain('aria-label="RB-42"');
    expect(html).toContain("350.00 SAR");
  });
  it("escapes names and can hide name/price; classic look adds a frame", () => {
    const { html } = labelsDocument([item], { w: 38, h: 25, showPrice: false, style: "classic" });
    expect(html).toContain("Riding &lt;boots&gt;");
    expect(html).not.toContain("350.00 SAR");
    expect(html).toContain('class="lb classic"');
  });
  it("keeps sizes in a safe range", () => {
    expect(normalizeSettings({ w: 1, h: 999, scale: 10 })).toMatchObject({ w: 15, h: 120, scale: 50, margin: 1 });
  });
});
