import { describe, expect, it } from "vitest";
import { byBranch, byDay, byItem, byMethod, riyadhDay, totals, type RInvoice, type RLine, type RPay } from "@/lib/report-calc";

const inv = (id: string, kind: RInvoice["kind"], at: string, gross: number, loc = "L1"): RInvoice =>
  ({ id, kind, issued_at: at, location_id: loc, salesperson_id: "S1", customer_id: null, gross_total: gross, net_total: Math.round(gross / 1.15 * 100) / 100, vat_total: Math.round((gross - gross / 1.15) * 100) / 100 });

describe("sales reports", () => {
  const invs = [inv("a", "invoice", "2026-11-15T22:30:00Z", 115), inv("b", "invoice", "2026-11-16T08:00:00Z", 230, "L2"), inv("c", "credit_note", "2026-11-16T09:00:00Z", 115)];
  it("days follow Riyadh time (22:30 UTC = next day in Riyadh)", () => {
    expect(riyadhDay("2026-11-15T22:30:00Z")).toBe("2026-11-16");
    expect(byDay(invs)).toEqual([{ key: "2026-11-16", count: 2, gross: 230, net: 200, vat: 30 }]);
  });
  it("returns count negative; branches sorted by sales", () => {
    expect(byBranch(invs).map((r) => [r.key, r.gross])).toEqual([["L2", 230], ["L1", 0]]);
    expect(totals(invs)).toMatchObject({ invoices: 2, returns: 1, gross: 230 });
  });
  it("payment methods net of refunds", () => {
    const pays: RPay[] = [{ invoice_id: "a", method: "cash", amount: 115 }, { invoice_id: "b", method: "mada", amount: 230 }, { invoice_id: "c", method: "cash", amount: 115 }];
    expect(byMethod(invs, pays)).toEqual([{ key: "mada", amount: 230 }, { key: "cash", amount: 0 }]);
  });
  it("items: best sellers first, returns subtracted", () => {
    const lines: RLine[] = [
      { invoice_id: "a", variant_id: "v1", name: "Boots", sku: "B", qty: 1, gross: 115, net: 100 },
      { invoice_id: "b", variant_id: "v2", name: "Gloves", sku: "G", qty: 2, gross: 230, net: 200 },
      { invoice_id: "c", variant_id: "v1", name: "Boots", sku: "B", qty: 1, gross: 115, net: 100 },
    ];
    expect(byItem(invs, lines).map((r) => [r.variant_id, r.qty, r.gross])).toEqual([["v2", 2, 230], ["v1", 0, 0]]);
  });
});
