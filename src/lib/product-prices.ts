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

export type PriceRow = { sku: string; name_en?: string; name_ar?: string; price?: string; wholesale?: string; cost?: string };

const HEAD: Record<keyof PriceRow, RegExp> = {
  sku: /^(sku|barcode|code|باركود|الباركود|كود|الكود|رقم الصنف)$/i,
  name_en: /^(name|name.?en|english name|title|الاسم بالإنجليزي|الاسم انجليزي)$/i,
  name_ar: /^(name.?ar|arabic name|الاسم|الاسم بالعربي|اسم الصنف|الاسم عربي)$/i,
  price: /^(price|sale price|selling price|السعر|سعر البيع)$/i,
  wholesale: /^(wholesale|wholesale price|سعر الجملة|الجملة)$/i,
  cost: /^(cost|cost price|التكلفة|سعر التكلفة)$/i,
};

const cleanMoney = (v: unknown): string | undefined => {
  const s = String(v ?? "").trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[,،\s]|SAR|ر\.س/gi, "");
  if (!s) return undefined;
  try { const h = toHalalas(s); return h < 0n ? undefined : formatDecimal(h); } catch { return undefined; }
};

/**
 * Sheet rows (first row = headers) → price rows. Unknown columns are ignored; rows without
 * a SKU are skipped; a repeated SKU keeps its last row. Returns the columns it understood.
 */
export function mapPriceSheet(rows: unknown[][]): { rows: PriceRow[]; columns: (keyof PriceRow)[]; skipped: number } {
  if (!rows.length) return { rows: [], columns: [], skipped: 0 };
  const head = rows[0].map((h) => String(h ?? "").trim());
  const idx: Partial<Record<keyof PriceRow, number>> = {};
  head.forEach((h, i) => {
    for (const k of Object.keys(HEAD) as (keyof PriceRow)[]) if (idx[k] === undefined && HEAD[k].test(h)) idx[k] = i;
  });
  if (idx.sku === undefined) return { rows: [], columns: [], skipped: rows.length - 1 };
  const out = new Map<string, PriceRow>();
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const sku = String(r[idx.sku] ?? "").trim();
    if (!sku) { skipped++; continue; }
    const row: PriceRow = { sku };
    const text = (k: "name_en" | "name_ar") => { const i = idx[k]; const v = i === undefined ? "" : String(r[i] ?? "").trim(); if (v) row[k] = v.slice(0, 200); };
    const num = (k: "price" | "wholesale" | "cost") => { const i = idx[k]; const v = i === undefined ? undefined : cleanMoney(r[i]); if (v !== undefined) row[k] = v; };
    text("name_en"); text("name_ar"); num("price"); num("wholesale"); num("cost");
    out.set(sku, row);
  }
  return { rows: [...out.values()], columns: (Object.keys(idx) as (keyof PriceRow)[]), skipped };
}
