/**
 * Recurring expenses: which periods are due. A period is a month (YYYY-MM-01);
 * an expense is due in its start month and then every 1 / 3 / 6 / 12 months,
 * on its due day, until its end date.
 */
export const FREQUENCIES = ["monthly", "quarterly", "half_yearly", "yearly", "occasional"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const EXPENSE_METHODS = ["bank", "cash", "cheque", "card", "other"] as const;
const STEP: Record<Frequency, number> = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12, occasional: 0 };

export type Recurring = { id: string; frequency: Frequency; due_day: number; start_on: string; end_on: string | null; active: boolean; amount: string | number };
export type Due = { id: string; period: string; dueOn: string; amount: number; overdue: boolean };

const ym = (d: string) => d.slice(0, 7);
const addMonths = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); const t = y * 12 + (mo - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
const monthsBetween = (a: string, b: string) => { const [y1, m1] = a.split("-").map(Number); const [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1); };

/** Periods (YYYY-MM-01) the expense falls in, from its start up to and including `untilMonth` (YYYY-MM). */
export function periods(r: Recurring, untilMonth: string): string[] {
  const out: string[] = [];
  const start = ym(r.start_on);
  const end = r.end_on ? ym(r.end_on) : null;
  if (r.frequency === "occasional") return monthsBetween(start, untilMonth) >= 0 ? [`${start}-01`] : [];
  for (let m = start; monthsBetween(m, untilMonth) >= 0 && (!end || monthsBetween(m, end) >= 0); m = addMonths(m, STEP[r.frequency])) out.push(`${m}-01`);
  return out;
}

/**
 * What is still to pay up to `horizon` days after `today` (YYYY-MM-DD): unpaid periods,
 * oldest first; overdue = its due day has passed. Older than `back` months is ignored.
 */
export function dueList(items: Recurring[], paid: Set<string>, today: string, horizon = 31, back = 24): Due[] {
  const until = new Date(Date.parse(`${today}T00:00:00Z`) + horizon * 86_400_000).toISOString().slice(0, 10);
  const oldest = addMonths(ym(today), -back);
  const out: Due[] = [];
  for (const r of items) {
    if (!r.active) continue;
    for (const p of periods(r, ym(until))) {
      if (monthsBetween(oldest, ym(p)) < 0 || paid.has(`${r.id}|${p}`)) continue;
      const dueOn = dueDate(r, p);
      if (dueOn > until) continue;
      out.push({ id: r.id, period: p, dueOn, amount: Number(r.amount), overdue: dueOn < today });
    }
  }
  return out.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

/** The day a period is due: its due day, or the date itself for an occasional expense. */
export const dueDate = (r: Pick<Recurring, "frequency" | "due_day" | "start_on">, period: string) =>
  r.frequency === "occasional" ? r.start_on.slice(0, 10) : `${ym(period)}-${String(r.due_day).padStart(2, "0")}`;

/** What one regular expense costs per month on average (occasional ones are not regular: 0). */
export const perMonth = (r: Pick<Recurring, "amount" | "frequency">) => (r.frequency === "occasional" ? 0 : Math.round((Number(r.amount) / STEP[r.frequency]) * 100) / 100);

/** The year's plan of one expense: planned amount per month (1–12) from its schedule. */
export function yearPlan(r: Recurring, year: string): number[] {
  const months = Array(12).fill(0) as number[];
  for (const p of periods(r, `${year}-12`)) if (p.startsWith(year)) months[Number(p.slice(5, 7)) - 1] += Number(r.amount);
  return months;
}
