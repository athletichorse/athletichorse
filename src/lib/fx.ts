/**
 * Exchange rates to SAR (settings key "fx_rates"), typed by the owner.
 * Expected purchase price = China price × rate. It is only a guide: shipping,
 * customs and other fees come on top, so it never replaces the real cost.
 */
export const FX_CURRENCIES = ["CNY", "USD", "EUR", "EGP", "AED", "TRY", "GBP"] as const;
export const DEFAULT_RATES: Record<string, number> = { SAR: 1, USD: 3.75 };

export function readRates(v: unknown): Record<string, number> {
  const out: Record<string, number> = { ...DEFAULT_RATES };
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const n = Number(x);
    if (/^[A-Z]{3}$/.test(k) && n > 0 && n < 100000) out[k] = n;
  }
  out.SAR = 1;
  return out;
}

/** China price × rate, in SAR (null when the price or the rate is missing). */
export function expectedSar(price: number | string | null | undefined, currency: string | null | undefined, rates: Record<string, number>) {
  if (price === null || price === undefined || price === "") return null;
  const r = rates[(currency ?? "CNY").toUpperCase()];
  return r ? Math.round(Number(price) * r * 100) / 100 : null;
}
