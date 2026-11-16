import "server-only";
import { db } from "./supabase/admin";

export type DrawerReport = {
  opening: number; sales: number; returns: number; invoices: number; creditNotes: number;
  byMethod: { method: string; sales: number; returns: number }[];
  cashIn: number; cashOut: number; expenses: { type: string; amount: number }[]; customerPayments: number;
  expected: number;
};

/** Totals for one or more shifts (one shift = shift report; a day's shifts = end of day). */
export async function drawerReport(shiftIds: string[], typeName: (id: string | null) => string): Promise<DrawerReport> {
  const empty: DrawerReport = { opening: 0, sales: 0, returns: 0, invoices: 0, creditNotes: 0, byMethod: [], cashIn: 0, cashOut: 0, expenses: [], customerPayments: 0, expected: 0 };
  if (!shiftIds.length) return empty;
  const [{ data: shifts }, { data: invs }, { data: moves }, { data: methods }] = await Promise.all([
    db().from("pos_shifts").select("id, opening_cash").in("id", shiftIds),
    db().from("invoices").select("id, kind, gross_total").in("shift_id", shiftIds),
    db().from("cash_movements").select("kind, amount, expense_type_id, method").in("shift_id", shiftIds),
    db().from("payment_methods").select("code, kind"),
  ]);
  const ids = (invs ?? []).map((i) => i.id);
  const pays: { invoice_id: string; method: string; amount: string }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db().from("invoice_payments").select("invoice_id, method, amount").in("invoice_id", ids.slice(i, i + 200));
    pays.push(...((data ?? []) as typeof pays));
  }
  const kindOf = new Map((invs ?? []).map((i) => [i.id, i.kind]));
  const cashKind = new Map((methods ?? []).map((m) => [m.code, m.kind]));
  const r: DrawerReport = { ...empty, byMethod: [], expenses: [] };
  r.opening = (shifts ?? []).reduce((a, s) => a + Number(s.opening_cash), 0);
  for (const i of invs ?? []) {
    if (i.kind === "invoice") { r.sales += Number(i.gross_total); r.invoices++; } else { r.returns += Number(i.gross_total); r.creditNotes++; }
  }
  const bm = new Map<string, { sales: number; returns: number }>();
  let cashNet = 0;
  for (const p of pays) {
    const e = bm.get(p.method) ?? { sales: 0, returns: 0 };
    const amt = Number(p.amount);
    if (kindOf.get(p.invoice_id) === "invoice") { e.sales += amt; if (cashKind.get(p.method) === "cash") cashNet += amt; }
    else { e.returns += amt; if (cashKind.get(p.method) === "cash") cashNet -= amt; }
    bm.set(p.method, e);
  }
  r.byMethod = [...bm.entries()].map(([method, v]) => ({ method, ...v }));
  const ex = new Map<string, number>();
  let cashPayments = 0;
  for (const m of moves ?? []) {
    const amt = Number(m.amount);
    if (m.kind === "cash_in") r.cashIn += amt;
    else if (m.kind === "cash_out") r.cashOut += amt;
    else if (m.kind === "expense") { const k = typeName(m.expense_type_id); ex.set(k, (ex.get(k) ?? 0) + amt); }
    else if (m.kind === "customer_payment") { r.customerPayments += amt; if ((cashKind.get(m.method ?? "cash") ?? "cash") === "cash") cashPayments += amt; }
  }
  r.expenses = [...ex.entries()].map(([type, amount]) => ({ type, amount }));
  const expenses = r.expenses.reduce((a, e) => a + e.amount, 0);
  r.expected = Math.round((r.opening + cashNet + r.cashIn + cashPayments - r.cashOut - expenses) * 100) / 100;
  return r;
}
