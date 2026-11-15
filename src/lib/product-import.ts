/**
 * Product spreadsheet import ("Upload file"). Pure functions, unit-tested.
 * The browser only reads the file and maps columns; the server re-validates every
 * row and converts prices (never trusting numbers computed in the browser).
 */
import { divRound, formatDecimal, toHalalas } from "./money";

export type ImportRow = {
  ref: string;            // original SKU / row key from the file (used to re-import without duplicates)
  sku: string | null;     // valid SKU, or null
  name_ar: string;
  name_en: string;
  group_ar: string;
  group_en: string;
  unit: string;
  codes: string[];
  price_src: string | null; // price as written in the file, in the file's currency
  active: boolean;
  service: boolean;
  model: string;
  option1: string;
  option2: string;
  images: string[];
};

export const CODE_RE = /^[A-Za-z0-9._/#*+-]{1,40}$/;
/** A usable SKU / barcode: allowed characters and at least one letter or digit. */
export const isCode = (s: string) => CODE_RE.test(s) && /[A-Za-z0-9]/.test(s);

/** Our brand on everything imported. */
export const BRAND = { en: "Alhisan Alriyadi", ar: "الحصان الرياضي" } as const;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s_-]*");
/**
 * Replaces other brand names with ours. The names come from the caller (on the server,
 * the private BRAND_REPLACE setting), so they are never written into this public code.
 */
export function scrubBrand(text: string, otherBrands: readonly string[] = []): string {
  let out = text;
  for (const b of otherBrands.map((x) => x.trim()).filter(Boolean)) {
    const ours = /[\u0600-\u06FF]/.test(b) ? BRAND.ar : BRAND.en;
    out = out.replace(new RegExp(escape(b), "gi"), ours);
  }
  return out;
}

const GROUP_EN: Record<string, string> = {
  "أدوات": "Equipment",
  "ملابس": "Clothing",
  "أحذية": "Shoes",
  "العاب": "Toys & Games",
  "ألعاب": "Toys & Games",
  "الحديد": "Weights",
};
const UNIT_MAP: Record<string, string> = { "قطعة": "piece", "زوج": "pair", "طقم": "set", "كرتونة": "box", "كجم": "kg", "متر": "m" };

const norm = (h: unknown) => String(h ?? "").trim().toLowerCase();
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const yes = (v: unknown, dflt: boolean) => {
  const s = norm(v);
  if (!s) return dflt;
  return ["yes", "y", "true", "1", "نعم"].includes(s);
};

/** Finds the column whose header starts with one of the given names. */
function col(headers: string[], ...names: string[]): number {
  return headers.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
}

export type MappedSheet = { rows: ImportRow[]; currency: string | null; skipped: number; ignoredStockColumns: number };

/** Maps the "Products" sheet (header row first) to import rows. */
export function mapSheet(data: unknown[][]): MappedSheet {
  if (!data.length) return { rows: [], currency: null, skipped: 0, ignoredStockColumns: 0 };
  const headers = data[0].map(norm);
  const c = {
    sku: col(headers, "sku"),
    nameAr: col(headers, "name (arabic)", "name_ar", "الاسم"),
    nameEn: col(headers, "name (english)", "name_en"),
    group: col(headers, "group"),
    unit: col(headers, "unit"),
    barcode: col(headers, "barcode"),
    codes: col(headers, "extra codes", "codes"),
    price: col(headers, "sale price", "price"),
    active: col(headers, "active"),
    service: col(headers, "service"),
    model: col(headers, "model code", "model"),
    colour: col(headers, "colour", "color"),
    size: col(headers, "size"),
    mainImage: col(headers, "main image"),
    images: col(headers, "all images", "images"),
    webTitle: col(headers, "website title"),
  };
  if (c.sku < 0 || (c.nameAr < 0 && c.nameEn < 0)) throw new Error("The file needs at least an SKU column and a name column.");
  const priceHeader = c.price >= 0 ? String(data[0][c.price] ?? "") : "";
  const currency = /\(([A-Za-z]{3})\)/.exec(priceHeader)?.[1]?.toUpperCase() ?? null;
  const ignoredStockColumns = headers.filter((h) => h.startsWith("stock") || h === "total stock").length;

  const rows: ImportRow[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const raw of data.slice(1)) {
    const at = (i: number) => (i >= 0 ? raw[i] : undefined);
    const ref = str(at(c.sku));
    const nameAr = str(at(c.nameAr));
    const nameEn = str(at(c.nameEn)) || str(at(c.webTitle));
    if (!ref || (!nameAr && !nameEn) || seen.has(ref)) {
      skipped++;
      continue;
    }
    seen.add(ref);
    const barcode = str(at(c.barcode));
    const sku = isCode(barcode) ? barcode : isCode(ref) ? ref : null;
    const codes = str(at(c.codes))
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter((x) => x && isCode(x) && x !== sku);
    if (barcode && sku === barcode && isCode(ref) && ref !== barcode) codes.push(ref);
    const images = [str(at(c.mainImage)), ...str(at(c.images)).split(/[\s,|]+/)]
      .filter((u) => /^https:\/\//.test(u));
    const group = str(at(c.group));
    const priceRaw = str(at(c.price));
    rows.push({
      ref: ref.slice(0, 60),
      sku,
      name_ar: nameAr.slice(0, 300),
      name_en: nameEn.slice(0, 300),
      group_ar: group && group.toUpperCase() !== "NONE" ? group.slice(0, 80) : "",
      group_en: GROUP_EN[group] ?? "",
      unit: UNIT_MAP[str(at(c.unit))] ?? "",
      codes: [...new Set(codes)].slice(0, 20),
      price_src: /^\d+(\.\d+)?$/.test(priceRaw) ? priceRaw : null,
      active: yes(at(c.active), true),
      service: yes(at(c.service), false),
      model: str(at(c.model)).slice(0, 60),
      option1: str(at(c.colour)).slice(0, 60),
      option2: str(at(c.size)).slice(0, 60),
      images: [...new Set(images)].slice(0, 10),
    });
  }
  return { rows, currency, skipped, ignoredStockColumns };
}

export type Rate = { from: string; to: string; whole: boolean }; // `from` units of file currency = `to` SAR

/**
 * Converts a file price to SAR using integer maths: price × to ÷ from,
 * rounded half-up to halalas, or to whole riyals when `whole`.
 * Returns "25.00" style text, or null when there is no usable price.
 */
export function convertPrice(src: string | null, rate: Rate): string | null {
  if (src === null || src === "") return null;
  const num = String(src).trim();
  // Up to 4 decimals in the file; scale to 1/10000 units.
  const m = /^(\d{1,9})(?:\.(\d{1,4}))?\d*$/.exec(num);
  if (!m) return null;
  const scaled = BigInt(m[1]) * 10000n + BigInt((m[2] ?? "").padEnd(4, "0") || "0");
  const from = toHalalas(rate.from); // rate values as 2-decimal numbers
  const to = toHalalas(rate.to);
  if (from <= 0n || to < 0n) throw new Error("Bad exchange rate");
  // halalas = scaled/10000 × to/from × 100
  let halalas = divRound(scaled * to, from * 100n);
  if (rate.whole) halalas = divRound(halalas, 100n) * 100n;
  return formatDecimal(halalas);
}
