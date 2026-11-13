/**
 * Money & VAT — integer halalas only (1 SAR = 100 halalas). No floats.
 *
 * Saudi rule: shelf prices are VAT-INCLUSIVE. For each line:
 *   gross = round(unit_price_incl × qty − discount)
 *   net   = round(gross × 100 / (100 + rate))
 *   vat   = gross − net            (so net + vat = gross, exactly)
 * Totals are the SUM of the rounded lines (never recomputed from the total).
 * Rounding: half away from zero.
 *
 * The server recomputes all of this; totals from the browser are never trusted.
 */

export type Halalas = bigint;

const DEC = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;
const QTY = /^(-)?(\d+)(?:\.(\d{1,3}))?$/;

function digitsToLatin(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".") // Arabic decimal separator
    .replace(/[,٬\s]/g, "");
}

/** "12.5" | "١٢٫٥٠" | 12.5 → 1250n. Throws on more than 2 decimals or junk. */
export function toHalalas(input: string | number | bigint): Halalas {
  if (typeof input === "bigint") return input * 100n;
  const s = digitsToLatin(typeof input === "number" ? input.toFixed(2) : input.trim());
  const m = DEC.exec(s);
  if (!m) throw new Error(`Invalid amount: ${input}`);
  const v = BigInt(m[2]) * 100n + BigInt((m[3] ?? "").padEnd(2, "0") || "0");
  return m[1] ? -v : v;
}

/** Quantity in thousandths: "2" → 2000n, "0.5" → 500n. */
export function toMilliQty(input: string | number): bigint {
  const s = digitsToLatin(typeof input === "number" ? String(input) : input.trim());
  const m = QTY.exec(s);
  if (!m) throw new Error(`Invalid quantity: ${input}`);
  const v = BigInt(m[2]) * 1000n + BigInt((m[3] ?? "").padEnd(3, "0") || "0");
  return m[1] ? -v : v;
}

/** Percent string "15" | "15.00" → basis points 1500n. */
export function rateToBp(rate: string | number): bigint {
  return toHalalas(rate); // same 2-decimal rule
}

/** Integer division rounded half away from zero. */
export function divRound(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new Error("Division by zero");
  const neg = a < 0n !== b < 0n;
  const A = a < 0n ? -a : a;
  const B = b < 0n ? -b : b;
  const q = (2n * A + B) / (2n * B);
  return neg ? -q : q;
}

/** "1234.5" → "1234.50" (for numeric(12,2) columns and the ZATCA QR). */
export function formatDecimal(h: Halalas): string {
  const neg = h < 0n;
  const a = neg ? -h : h;
  return `${neg ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
}

/** Display: "1,234.50 ر.س" / "SAR 1,234.50". */
export function formatSAR(h: Halalas, locale: "ar" | "en" = "ar"): string {
  const [i, f] = formatDecimal(h).split(".");
  const neg = i.startsWith("-");
  const grouped = (neg ? i.slice(1) : i).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const n = `${neg ? "-" : ""}${grouped}.${f}`;
  return locale === "ar" ? `${n} ر.س` : `SAR ${n}`;
}

/** Split a VAT-inclusive gross amount into net + VAT. */
export function splitInclusive(gross: Halalas, rateBp: bigint): { net: Halalas; vat: Halalas; gross: Halalas } {
  const net = divRound(gross * 10000n, 10000n + rateBp);
  return { net, vat: gross - net, gross };
}

export type LineInput = {
  unitPriceIncl: Halalas; // VAT-inclusive shelf price per unit
  qtyMilli: bigint; // quantity × 1000 (negative for returns)
  discount?: Halalas; // VAT-inclusive line discount (positive number)
};
export type LineAmounts = { gross: Halalas; net: Halalas; vat: Halalas; discount: Halalas };

export function computeLine(line: LineInput, rateBp: bigint): LineAmounts {
  const discount = line.discount ?? 0n;
  if (discount < 0n) throw new Error("Discount cannot be negative");
  const before = divRound(line.unitPriceIncl * line.qtyMilli, 1000n);
  const absBefore = before < 0n ? -before : before;
  if (discount > absBefore) throw new Error("Discount larger than line amount");
  const gross = before < 0n ? before + discount : before - discount;
  const { net, vat } = splitInclusive(gross, rateBp);
  return { gross, net, vat, discount };
}

export function computeTotals(lines: readonly LineInput[], rateBp: bigint) {
  const computed = lines.map((l) => computeLine(l, rateBp));
  const sum = (k: keyof LineAmounts) => computed.reduce((a, l) => a + l[k], 0n);
  return { lines: computed, net: sum("net"), vat: sum("vat"), gross: sum("gross"), discount: sum("discount") };
}
