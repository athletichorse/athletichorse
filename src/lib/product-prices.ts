/**
 * Item prices helpers (pure, tested):
 *  - saleWindow: checks a "sale price for a period"
 *  - mapPriceSheet: reads a names & prices file (by SKU) whatever the column names
 */
import { formatDecimal, toHalalas } from "./money";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Sale price + period → columns to save, or null when invalid. Empty price clears the sale. */
export function saleWindow(price: string | null, from: string, to: string):
  { sale_price: string | null; sale_from: string | null; sale_to: string | null } | null {
  const f = from.trim(), t = to.trim();
  if (!price) return { sale_price: null, sale_from: null, sale_to: null };
  if ((f && !DATE.test(f)) || (t && !DATE.test(t))) return null;
  if (!f && !t) return null; // a sale price needs a period
  if (f && t && t < f) return null;
  return { sale_price: price, sale_from: f || null, sale_to: t || null };
}

/** levels: price level id → price (one column per level in the file) */
export type PriceRow = { sku: string; name_en?: string; name_ar?: string; price?: string; wholesale?: string; cost?: string; levels?: Record<string, string> };
/** A price level the file may have a column for: its column may be called by any of these names. */
export type LevelColumn = { id: string; names: string[] };
const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, " ");
/** "VIP", "VIP price", "Price VIP", "سعر VIP", "سعر كبار العملاء" → that level. */
export function levelForHeader(h: string, levels: LevelColumn[]): string | null {
  const x = norm(h).replace(/^(سعر|price)\s+/, "").replace(/\s+(price|سعر)$/, "");
  for (const l of levels) if (l.names.some((n) => n.trim() && norm(n) === x)) return l.id;
  return null;
}

const HEAD: Record<keyof PriceRow, RegExp> = {
  // a code column: any header that mentions barcode / code / SKU (e.g. "الباركود / الرقم", "Item code")
  sku: /(sku|barcode|bar code|\bcode\b|item no\.?|item number|باركود|كود|رمز الصنف|رقم الصنف)/i,
  levels: /^$/, // not a header: one column per price level (see levelForHeader)
  name_en: /^(name|name.?en|english name|item name|title|الاسم بالإنجليزي|الاسم انجليزي|اسم الصنف \(en\)|اسم الصنف انجليزي)$/i,
  name_ar: /^(name.?ar|arabic name|الاسم|الاسم بالعربي|اسم الصنف|الاسم عربي|اسم الصنف \(ع\)|اسم الصنف عربي|البيان|الصنف)$/i,
  price: /^(price|sale price|selling price|retail price|السعر|سعر البيع|سعر القطاعي|سعر التجزئة|سعر المستهلك)$/i,
  wholesale: /^(wholesale|wholesale price|سعر الجملة|الجملة|جملة|سعر بيع الجملة)$/i,
  cost: /^(cost|cost price|purchase price|التكلفة|سعر التكلفة|سعر الشراء|تكلفة)$/i,
};
/** Header as people write it: no extra spaces, no trailing ":", no hidden characters, one kind of alef. */
export const normHeader = (h: unknown) => String(h ?? "").replace(/[\u200e\u200f\u00a0\ufeff]/g, " ").replace(/\s+/g, " ").trim().replace(/[:：]$/, "").trim().replace(/[إأآ]/g, "ا");

const cleanMoney = (v: unknown): string | undefined => {
  const s = String(v ?? "").trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[,،\s]|SAR|ر\.س/gi, "");
  if (!s) return undefined;
  try { const h = toHalalas(s); return h < 0n ? undefined : formatDecimal(h); } catch { return undefined; }
};

/**
 * Sheet rows (first row = headers) → price rows. Unknown columns are ignored; rows without
 * a SKU are skipped; a repeated SKU keeps its last row. Returns the columns it understood.
 */
export function mapPriceSheet(rowsIn: unknown[][], levels: LevelColumn[] = []): { rows: PriceRow[]; columns: (keyof PriceRow)[]; levelColumns: string[]; skipped: number } {
  let rows = rowsIn.filter((r) => Array.isArray(r));
  if (!rows.length) return { rows: [], columns: [], levelColumns: [], skipped: 0 };
  // the header row may be below a title or a blank row: the first of the first 20 rows with a code column
  const norm = (h: unknown) => normHeader(h);
  const skuRe = new RegExp(HEAD.sku.source.replace(/[إأآ]/g, "ا"), "i");
  const hr = Math.max(0, rows.slice(0, 20).findIndex((r) => (r ?? []).some((h) => skuRe.test(norm(h)))));
  rows = rows.slice(hr);
  const head = rows[0].map((h) => norm(h));
  const idx: Partial<Record<keyof PriceRow, number>> = {};
  const levelIdx = new Map<string, number>();
  head.forEach((h, i) => {
    for (const k of Object.keys(HEAD) as (keyof PriceRow)[]) {
      if (k === "levels" || idx[k] !== undefined) continue;
      if (new RegExp(HEAD[k].source.replace(/[إأآ]/g, "ا"), "i").test(h)) return void (idx[k] = i);
    }
    const lv = levelForHeader(h, levels);
    if (lv && !levelIdx.has(lv)) levelIdx.set(lv, i);
  });
  if (idx.sku === undefined) return { rows: [], columns: [], levelColumns: [], skipped: rows.length - 1 };
  const out = new Map<string, PriceRow>();
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const raw = r[idx.sku];
    const sku = (typeof raw === "number" && Number.isInteger(raw) ? String(raw) : String(raw ?? "")).trim().replace(/\.0+$/, "");
    if (!sku) { skipped++; continue; }
    const row: PriceRow = { sku };
    const text = (k: "name_en" | "name_ar") => { const i = idx[k]; const v = i === undefined ? "" : String(r[i] ?? "").trim(); if (v) row[k] = v.slice(0, 200); };
    const num = (k: "price" | "wholesale" | "cost") => { const i = idx[k]; const v = i === undefined ? undefined : cleanMoney(r[i]); if (v !== undefined) row[k] = v; };
    text("name_en"); text("name_ar"); num("price"); num("wholesale"); num("cost");
    for (const [lv, i] of levelIdx) { const v = cleanMoney(r[i]); if (v !== undefined) (row.levels ??= {})[lv] = v; }
    out.set(sku, row);
  }
  return { rows: [...out.values()], columns: (Object.keys(idx) as (keyof PriceRow)[]), levelColumns: [...levelIdx.keys()], skipped };
}
