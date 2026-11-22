import { riyadhDate } from "./time";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** From/to dates (Riyadh) from the address; default: this month so far. With the matching UTC instants. */
export function range(sp: { from?: string; to?: string }) {
  const today = riyadhDate(new Date());
  const from = DAY.test(sp.from ?? "") ? sp.from! : `${today.slice(0, 8)}01`;
  const to = DAY.test(sp.to ?? "") ? sp.to! : today;
  return { from, to, fromIso: new Date(`${from}T00:00:00+03:00`).toISOString(), toIso: new Date(`${to}T23:59:59.999+03:00`).toISOString(),
    days: Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1) };
}

/** Read every page of a query (1000 rows at a time, up to a limit). */
export async function allRows<T>(page: (a: number, b: number) => PromiseLike<{ data: unknown[] | null }>, max = 200_000): Promise<T[]> {
  const out: T[] = [];
  for (let a = 0; a < max; a += 1000) {
    const { data } = await page(a, a + 999);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Suggested pieces to buy: what sells in `cover` days at the period's speed, minus stock now (never below 0). */
export function toBuy(sold: number, days: number, stock: number, cover: number) {
  const perDay = sold / Math.max(1, days);
  return { perDay: Math.round(perDay * 100) / 100, daysLeft: perDay > 0 ? Math.floor(Math.max(0, stock) / perDay) : null, buy: Math.max(0, Math.ceil(perDay * cover - Math.max(0, stock))) };
}
