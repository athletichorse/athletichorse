import { describe, expect, it } from "vitest";
import { readStatement } from "@/lib/courier-statement";

describe("courier statement file", () => {
  it("finds waybill, collected amount and fee columns under a title row (Arabic)", () => {
    const r = readStatement([
      ["كشف تحصيلات أرامكس - نوفمبر"],
      [],
      ["التاريخ", "رقم البوليصة", "المبلغ المحصل", "الرسوم"],
      ["2026-11-20", 44123456789, "230", "12.5"],
      ["2026-11-20", "AWB-2", "١٥٠", ""],
      ["", "", "", ""],
    ]);
    expect(r.found).toEqual({ waybill: true, amount: true, fee: true });
    expect(r.rows).toEqual([{ waybill: "44123456789", collected: "230.00", fee: "12.50" }, { waybill: "AWB-2", collected: "150.00", fee: "0.00" }]);
  });
  it("English headers; a repeated waybill keeps the last row; negatives become positive", () => {
    const r = readStatement([["AWB", "COD Amount", "Charges"], ["X1", "100", "-10"], ["X1", "120", "10"]]);
    expect(r.rows).toEqual([{ waybill: "X1", collected: "120.00", fee: "10.00" }]);
  });
  it("no waybill column → nothing", () => {
    expect(readStatement([["Order", "Total"], ["1", "5"]]).found.waybill).toBe(false);
  });
});
