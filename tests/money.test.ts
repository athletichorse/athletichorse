import { describe, expect, it } from "vitest";
import { computeLine, computeTotals, divRound, formatDecimal, formatSAR, rateToBp, splitInclusive, toHalalas, toMilliQty } from "@/lib/money";

const VAT15 = rateToBp("15.00");

describe("parsing", () => {
  it("parses SAR amounts into halalas", () => {
    expect(toHalalas("115")).toBe(11500n);
    expect(toHalalas("0.5")).toBe(50n);
    expect(toHalalas("1,234.56")).toBe(123456n);
    expect(toHalalas("١٢٫٥٠")).toBe(1250n); // Arabic-Indic digits
    expect(toHalalas("-3.10")).toBe(-310n);
  });
  it("rejects more than 2 decimals and junk", () => {
    expect(() => toHalalas("1.005")).toThrow();
    expect(() => toHalalas("abc")).toThrow();
  });
  it("parses quantities in thousandths", () => {
    expect(toMilliQty("2")).toBe(2000n);
    expect(toMilliQty("0.25")).toBe(250n);
  });
  it("VAT rate as basis points", () => expect(VAT15).toBe(1500n));
});

describe("rounding", () => {
  it("rounds half away from zero", () => {
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(divRound(4n, 3n)).toBe(1n);
  });
  it("formats", () => {
    expect(formatDecimal(123456n)).toBe("1234.56");
    expect(formatDecimal(-5n)).toBe("-0.05");
    expect(formatSAR(123456n, "ar")).toBe("1,234.56 ر.س");
    expect(formatSAR(100n, "en")).toBe("SAR 1.00");
  });
});

describe("VAT-inclusive split (15%)", () => {
  it("115.00 incl → 100.00 net + 15.00 VAT", () => {
    expect(splitInclusive(11500n, VAT15)).toEqual({ net: 10000n, vat: 1500n, gross: 11500n });
  });
  it("net + VAT always equals gross", () => {
    for (let g = 1n; g < 5000n; g += 7n) {
      const { net, vat } = splitInclusive(g, VAT15);
      expect(net + vat).toBe(g);
    }
  });
  it("10.00 incl → 8.70 net + 1.30 VAT", () => {
    expect(splitInclusive(1000n, VAT15)).toEqual({ net: 870n, vat: 130n, gross: 1000n });
  });
  it("0% rate", () => expect(splitInclusive(999n, 0n)).toEqual({ net: 999n, vat: 0n, gross: 999n }));
});

describe("lines and totals", () => {
  it("qty × price − discount, then split", () => {
    const l = computeLine({ unitPriceIncl: 2999n, qtyMilli: 3000n, discount: 497n }, VAT15);
    expect(l.gross).toBe(8500n); // 89.97 − 4.97
    expect(l.net).toBe(7391n); // 85.00 / 1.15 = 73.913…
    expect(l.vat).toBe(1109n);
  });
  it("fractional qty rounds per line", () => {
    const l = computeLine({ unitPriceIncl: 1999n, qtyMilli: 333n }, VAT15);
    expect(l.gross).toBe(666n); // 6.65667 → 6.66
  });
  it("returns (negative qty) give negative amounts", () => {
    const l = computeLine({ unitPriceIncl: 11500n, qtyMilli: -1000n }, VAT15);
    expect(l).toMatchObject({ gross: -11500n, net: -10000n, vat: -1500n });
  });
  it("rejects bad discounts", () => {
    expect(() => computeLine({ unitPriceIncl: 100n, qtyMilli: 1000n, discount: 101n }, VAT15)).toThrow();
    expect(() => computeLine({ unitPriceIncl: 100n, qtyMilli: 1000n, discount: -1n }, VAT15)).toThrow();
  });
  it("totals are the sum of rounded lines", () => {
    const lines = Array.from({ length: 3 }, () => ({ unitPriceIncl: 100n, qtyMilli: 1000n }));
    const tot = computeTotals(lines, VAT15);
    // each line: 1.00 → net 0.87, VAT 0.13. Sum: net 2.61, VAT 0.39 (not 3.00/1.15 = 2.61 / 0.39 by luck — check sum rule)
    expect(tot.gross).toBe(300n);
    expect(tot.net).toBe(261n);
    expect(tot.vat).toBe(39n);
    expect(tot.net + tot.vat).toBe(tot.gross);
  });
  it("sum-of-lines differs from total-level calculation when it should", () => {
    const lines = Array.from({ length: 7 }, () => ({ unitPriceIncl: 1n, qtyMilli: 1000n }));
    const tot = computeTotals(lines, VAT15);
    expect(tot.net).toBe(7n); // each 0.01 → net 0.01, VAT 0.00
    expect(tot.vat).toBe(0n);
    expect(splitInclusive(7n, VAT15).vat).toBe(1n); // whole-invoice split would differ
  });
});
