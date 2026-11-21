/**
 * A shipping company's payment statement (Excel / CSV) → rows by waybill (pure, tested).
 * Columns are found by name, wherever the header row is (first 20 rows):
 *   waybill:  رقم البوليصة / البوليصة / رقم الشحنة / AWB / waybill / tracking / shipment
 *   amount:   المبلغ المحصل / مبلغ التحصيل / COD / collected / amount
 *   fee:      الرسوم / رسوم / عمولة / fee / fees / charges (optional)
 */
export type StatementRow = { waybill: string; collected: string; fee: string };

const norm = (h: unknown) => String(h ?? "").replace(/[‎‏ ﻿]/g, " ").replace(/\s+/g, " ").trim().toLowerCase().replace(/[إأآ]/g, "ا");
const WAYBILL = /(بوليصه|بوليصة|رقم الشحنه|رقم الشحنة|awb|waybill|tracking|shipment)/i;
const AMOUNT = /(محصل|التحصيل|تحصيل|cod|collected|amount|المبلغ|مبلغ)/i;
const FEE = /(رسوم|عموله|عمولة|fee|charge)/i;

const money = (v: unknown): string | null => {
  const s = String(v ?? "").trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٫]/g, ".").replace(/[,،\s]|SAR|ر\.س/gi, "");
  if (!s) return null;
  if (!/^-?\d{1,9}(\.\d{1,3})?$/.test(s)) return null;
  return Math.abs(Number(s)).toFixed(2);
};

export function readStatement(rowsIn: unknown[][]): { rows: StatementRow[]; found: { waybill: boolean; amount: boolean; fee: boolean }; skipped: number } {
  const rows = rowsIn.filter((r) => Array.isArray(r));
  const hr = Math.max(0, rows.slice(0, 20).findIndex((r) => r.some((h) => WAYBILL.test(norm(h)))));
  const head = (rows[hr] ?? []).map(norm);
  const wi = head.findIndex((h) => WAYBILL.test(h));
  // the amount column: not the fee column
  const fi = head.findIndex((h, i) => i !== wi && FEE.test(h));
  const ai = head.findIndex((h, i) => i !== wi && i !== fi && AMOUNT.test(h));
  const found = { waybill: wi >= 0, amount: ai >= 0, fee: fi >= 0 };
  if (wi < 0) return { rows: [], found, skipped: 0 };
  const out = new Map<string, StatementRow>();
  let skipped = 0;
  for (const r of rows.slice(hr + 1)) {
    const raw = r[wi];
    const waybill = (typeof raw === "number" && Number.isInteger(raw) ? String(raw) : String(raw ?? "")).trim().replace(/\.0+$/, "");
    if (!waybill) { skipped++; continue; }
    out.set(waybill.toUpperCase(), { waybill, collected: (ai >= 0 && money(r[ai])) || "0.00", fee: (fi >= 0 && money(r[fi])) || "0.00" });
  }
  return { rows: [...out.values()], found, skipped };
}
