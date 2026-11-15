/**
 * Barcode stickers for any label printer. One sticker = one printed page of the
 * chosen size, so Zebra / Xprinter drivers cut each label correctly.
 * Pure (tested): builds the printable HTML document.
 */
import { code128Svg } from "./barcode";

export type LabelPreset = "zebra" | "xprinter" | "custom";
export const LABEL_PRESETS: Record<Exclude<LabelPreset, "custom">, { w: number; h: number }> = {
  zebra: { w: 40, h: 25 }, // Zebra LP 2824
  xprinter: { w: 38, h: 25 }, // Xprinter
};

export type LabelSettings = {
  w: number; h: number; margin: number; scale: number;
  style: "standard" | "classic"; showName: boolean; showPrice: boolean; showLogo: boolean;
  /** Logo image URL (the website logo). */
  logo?: string;
};
export type LabelItem = { sku: string; name: string; options: string; price: string; qty: number };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo);

export function normalizeSettings(s: Partial<LabelSettings>): LabelSettings {
  return {
    w: clamp(Number(s.w), 15, 120), h: clamp(Number(s.h), 10, 120), margin: clamp(Number(s.margin ?? 1), 0, 10),
    scale: clamp(Number(s.scale ?? 100), 50, 150), style: s.style === "classic" ? "classic" : "standard",
    showName: s.showName !== false, showPrice: s.showPrice !== false, showLogo: s.showLogo !== false,
    logo: typeof s.logo === "string" && /^(https:\/\/|\/)[^"'<>\s]+$/.test(s.logo) ? s.logo : "/brand/logo.png",
  };
}

/** One sticker's inner HTML. */
export function labelBody(it: LabelItem, s: LabelSettings): string {
  const name = `${it.name}${it.options ? ` · ${it.options}` : ""}`;
  const bar = code128Svg(it.sku, 40, 1);
  const price = `${it.price} SAR`;
  const logo = s.showLogo ? `<img class="lg" src="${esc(s.logo ?? "/brand/logo.png")}" alt="">` : "";
  if (s.style === "classic") {
    return `<div class="lb classic">${logo}${s.showName ? `<div class="nm">${esc(name)}</div>` : ""}<div class="bc">${bar}</div><div class="row"><span class="sku">${esc(it.sku)}</span>${s.showPrice ? `<span class="pr">${esc(price)}</span>` : ""}</div></div>`;
  }
  return `<div class="lb">${logo}${s.showName ? `<div class="nm">${esc(name)}</div>` : ""}${s.showPrice ? `<div class="pr">${esc(price)}</div>` : ""}<div class="bc">${bar}</div><div class="sku">${esc(it.sku)}</div></div>`;
}

/** Full printable document: one page per sticker (qty copies of each item). */
export function labelsDocument(items: LabelItem[], raw: Partial<LabelSettings>, title = "Labels"): { html: string; count: number } {
  const s = normalizeSettings(raw);
  const pages: string[] = [];
  for (const it of items) for (let i = 0; i < Math.max(0, Math.min(500, Math.floor(it.qty))); i++) pages.push(`<section class="pg">${labelBody(it, s)}</section>`);
  const k = s.scale / 100;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{size:${s.w}mm ${s.h}mm;margin:0}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;color:#000}
.pg{width:${s.w}mm;height:${s.h}mm;padding:${s.margin}mm;overflow:hidden;page-break-after:always;break-after:page;display:flex}
.pg:last-child{page-break-after:auto;break-after:auto}
.lb{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;transform:scale(${k});transform-origin:center}
.lg{height:${Math.max(2.5, s.h * 0.16).toFixed(1)}mm;width:auto;max-width:90%;object-fit:contain;margin-bottom:.3mm}
.nm{font-size:7.5pt;line-height:1.1;max-height:2.2em;overflow:hidden;width:100%}
.pr{font-size:10pt;font-weight:700;margin:.4mm 0}
.bc{width:100%;height:${Math.max(5, s.h * (s.showLogo ? 0.3 : 0.38)).toFixed(1)}mm}.bc svg{width:100%;height:100%}
.sku{font-size:7pt;letter-spacing:.5px;font-family:monospace}
.classic{border:0.3mm solid #000;border-radius:1mm;padding:.6mm}
.classic .row{display:flex;justify-content:space-between;width:100%;align-items:baseline}
.classic .pr{font-size:9pt;margin:0}
@media screen{body{background:#eee;display:flex;flex-wrap:wrap;gap:4mm;padding:4mm}.pg{background:#fff;box-shadow:0 0 0 .2mm #999}}
</style></head><body>${pages.join("")}</body></html>`;
  return { html, count: pages.length };
}
