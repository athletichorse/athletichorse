/**
 * Sales reports: pure aggregations over invoices and their lines (tested).
 * Credit notes (returns) count negative. Amounts are rounded to halalas at the end.
 */
export type RInvoice = { id: string; kind: "invoice" | "credit_note"; issued_at: string; location_id: string; salesperson_id: string | null; customer_id: string | null; gross_total: string | number; net_total: string | number; vat_total: string | number };
export type RLine = { invoice_id: string; variant_id: string; name: string; sku: string | null; qty: string | number; gross: string | number; net: string | number };
export type RPay = { invoice_id: string; method: string; amount: string | number };
export type Row = { key: string; count: number; gross: number; net: number; vat: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const sign = (i: RInvoice) => (i.kind === "credit_note" ? -1 : 1);

/** Asia/Riyadh calendar day of a timestamp. */
export const riyadhDay = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(0, 10);

export function groupInvoices(invs: RInvoice[], keyOf: (i: RInvoice) => string): Row[] {
  const m = new Map<string, Row>();
  for (const i of invs) {
    const k = keyOf(i);
    const row = m.get(k) ?? { key: k, count: 0, gross: 0, net: 0, vat: 0 };
    const s = sign(i);
    row.count += i.kind === "invoice" ? 1 : 0;
    row.gross += s * Number(i.gross_total); row.net += s * Number(i.net_total); row.vat += s * Number(i.vat_total);
    m.set(k, row);
  }
  return [...m.values()].map((x) => ({ ...x, gross: r2(x.gross), net: r2(x.net), vat: r2(x.vat) })).sort((a, b) => b.gross - a.gross);
}

export const byDay = (invs: RInvoice[]) => groupInvoices(invs, (i) => riyadhDay(i.issued_at)).sort((a, b) => a.key.localeCompare(b.key));
export const byBranch = (invs: RInvoice[]) => groupInvoices(invs, (i) => i.location_id);
export const bySalesperson = (invs: RInvoice[]) => groupInvoices(invs, (i) => i.salesperson_id ?? "");
export const byCustomer = (invs: RInvoice[]) => groupInvoices(invs.filter((i) => i.customer_id), (i) => i.customer_id!);

export function byMethod(invs: RInvoice[], pays: RPay[]): { key: string; amount: number }[] {
  const kind = new Map(invs.map((i) => [i.id, i]));
  const m = new Map<string, number>();
  for (const p of pays) {
    const i = kind.get(p.invoice_id);
    if (!i) continue;
    m.set(p.method, (m.get(p.method) ?? 0) + sign(i) * Number(p.amount));
  }
  return [...m.entries()].map(([key, amount]) => ({ key, amount: r2(amount) })).sort((a, b) => b.amount - a.amount);
}

export type ItemRow = { variant_id: string; name: string; sku: string | null; qty: number; gross: number; net: number };
/** Every item sold: quantity and value net of returns. Sorted best first. */
export function byItem(invs: RInvoice[], lines: RLine[]): ItemRow[] {
  const kind = new Map(invs.map((i) => [i.id, i]));
  const m = new Map<string, ItemRow>();
  for (const l of lines) {
    const i = kind.get(l.invoice_id);
    if (!i) continue;
    const s = sign(i);
    const row = m.get(l.variant_id) ?? { variant_id: l.variant_id, name: l.name, sku: l.sku, qty: 0, gross: 0, net: 0 };
    row.qty += s * Number(l.qty); row.gross += s * Number(l.gross); row.net += s * Number(l.net);
    m.set(l.variant_id, row);
  }
  return [...m.values()].map((x) => ({ ...x, qty: Math.round(x.qty * 1000) / 1000, gross: r2(x.gross), net: r2(x.net) })).sort((a, b) => b.qty - a.qty || b.gross - a.gross);
}

export function totals(invs: RInvoice[]) {
  const g = groupInvoices(invs, () => "all")[0];
  return { invoices: invs.filter((i) => i.kind === "invoice").length, returns: invs.filter((i) => i.kind === "credit_note").length, gross: g?.gross ?? 0, net: g?.net ?? 0, vat: g?.vat ?? 0 };
}
