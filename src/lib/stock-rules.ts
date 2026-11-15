/** Comparison rules for the shortages report (pure, tested). */
export const RULES = ["=", "!=", ">", ">=", "<", "<="] as const;
export type Rule = (typeof RULES)[number];

export function applyRule(qty: number, rule: Rule, value: number): boolean {
  switch (rule) {
    case "=": return qty === value;
    case "!=": return qty !== value;
    case ">": return qty > value;
    case ">=": return qty >= value;
    case "<": return qty < value;
    case "<=": return qty <= value;
  }
}
