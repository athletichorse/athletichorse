/** Item condition in a store: sound / damaged / partial defect. Shared by screens and server. */
export const CONDITIONS = ["good", "damaged", "partial"] as const;
export type Condition = (typeof CONDITIONS)[number];
export const DEFECT_ACTIONS = ["return_supplier", "repair", "scrap"] as const;
export type DefectAction = (typeof DEFECT_ACTIONS)[number];

const KNOWN = ["not_enough", "bad_qty", "bad_condition", "bad_action", "bad_supplier"];
/** Database error → short code the screens translate. */
export function condError(message: string | undefined) {
  const m = String(message ?? "error");
  return KNOWN.find((k) => m.includes(k)) ?? m.slice(0, 160);
}

/** Shares of the stock on hand (percent, 1 decimal). Faulty pieces above the stock (after sales) count as all. */
export function conditionShares(onHand: number, damaged: number, partial: number) {
  const base = Math.max(onHand, damaged + partial, 0);
  const pct = (x: number) => (base > 0 ? Math.round((x / base) * 1000) / 10 : 0);
  const good = Math.max(0, onHand - damaged - partial);
  return { good, damagedPct: pct(damaged), partialPct: pct(partial), badPct: pct(damaged + partial) };
}
