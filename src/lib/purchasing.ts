/**
 * Purchasing + B2B orders: the small rules shared by the screens and the server.
 * The database recomputes every total; these only check input and show previews.
 */

export const PO_STATUSES = ["draft", "ordered", "shipped", "partial", "received", "cancelled"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];
export const B2B_STATUSES = ["new", "in_production", "ready", "delivered", "invoiced", "cancelled"] as const;
export type B2bStatus = (typeof B2B_STATUSES)[number];
/** Badge colours for the B2B stages. */
export const B2B_TONE: Record<B2bStatus, string> = {
  new: "badge-gray", in_production: "badge-blue", ready: "badge bg-indigo-50 text-indigo-800", delivered: "badge bg-teal-50 text-teal-800",
  invoiced: "badge-green", cancelled: "badge bg-red-50 text-red-700",
};
export const SUPPLIER_METHODS = ["bank", "cash", "cheque", "other"] as const;
export const B2B_METHODS = ["bank", "cash", "cheque", "card", "other"] as const;
export const CURRENCIES = ["SAR", "EGP", "USD", "EUR", "AED", "CNY", "TRY", "GBP"] as const;

const DIGITS: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "٫": ".", "،": "" };
/** "١٢٫٥" → "12.5"; commas and spaces dropped. */
export const latin = (v: unknown) => String(v ?? "").trim().replace(/[٠-٩٫،]/g, (c) => DIGITS[c] ?? c).replace(/[,\s]/g, "");

export const isCurrency = (c: string) => /^[A-Z]{3}$/.test(c);
/** A positive number with at most `dec` decimals (as text), or null. */
export function num(v: unknown, dec: number, allowZero = false): string | null {
  const s = latin(v);
  if (!new RegExp(`^\\d{1,10}(\\.\\d{1,${dec}})?$`).test(s)) return null;
  if (!allowZero && Number(s) <= 0) return null;
  return s;
}

/** Next steps a B2B order can take from where it is (the order of the buttons). */
export function b2bNext(status: B2bStatus): B2bStatus[] {
  switch (status) {
    case "new": return ["in_production", "ready", "delivered", "cancelled"];
    case "in_production": return ["ready", "delivered", "cancelled"];
    case "ready": return ["delivered", "cancelled"];
    case "delivered": return ["invoiced"];
    default: return [];
  }
}

/** Same rule as the till and the database: prices include VAT; per line gross → net. */
export function b2bTotals(lines: { qty: string; price: string; discount: string }[], vatRate: number) {
  let gross = 0, net = 0;
  for (const l of lines) {
    const q = Number(latin(l.qty)) || 0, p = Number(latin(l.price)) || 0, d = Math.min(100, Math.max(0, Number(latin(l.discount)) || 0));
    const g = round2((p * q * (100 - d)) / 100);
    gross += g;
    net += round2((g * 100) / (100 + vatRate));
  }
  gross = round2(gross); net = round2(net);
  return { gross, net, vat: round2(gross - net) };
}
export const round2 = (x: number) => Math.round((x + Math.sign(x) * Number.EPSILON) * 100) / 100;

/** Statement lines oldest first with the running balance. */
export function withRunning<T extends { amount: number | string }>(rows: T[]): (T & { balance: number })[] {
  let b = 0;
  return rows.map((r) => ({ ...r, balance: (b = round2(b + Number(r.amount))) }));
}

/** Database error → short code the screens translate (unknown errors pass through). */
export function errCode(message: string | undefined, known: readonly string[]) {
  const m = String(message ?? "error");
  const hit = known.find((k) => new RegExp(`\\b${k}\\b`).test(m));
  if (hit) return hit;
  if (/duplicate key/i.test(m)) return "duplicate";
  return m.slice(0, 160);
}
