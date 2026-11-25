import { describe, expect, it } from "vitest";
import { landed, parseCsvRows, readChinaSheet, type CnLine } from "@/lib/china";

const L = (o: Partial<CnLine>): CnLine => ({ supplier_code: "", description: "", variant_id: null, cartons: "", per_carton: "1", unit_price: "", carton_cbm: "", ...o });

describe("China orders", () => {
  it("landed cost: same as the database (shipping by CBM, customs + other by value)", () => {
    const r = landed([L({ cartons: "4", per_carton: "50", unit_price: "18", carton_cbm: "0.18" }), L({ cartons: "6", per_carton: "50", unit_price: "33", carton_cbm: "0.2" })],
      { rate: "0.52", rate_paid: "", fee_shipping: "1000", fee_customs: "300", fee_other: "100" });
    expect(r.rows[0].unit).toBe(11.7683);
    expect(r.rows[1].unit).toBe(20.2211);
    expect(r.totCny).toBe(13500);
    expect(r.totCbm).toBe(1.92);
    expect(r.goodsSar).toBe(7020);
    expect(r.total).toBe(8420);
    expect(r.feePct).toBe(19.9);
  });
  it("the rate actually paid is used, and its difference shown", () => {
    const r = landed([L({ cartons: "1", per_carton: "10", unit_price: "100" })], { rate: "0.52", rate_paid: "0.53", fee_shipping: "", fee_customs: "", fee_other: "" });
    expect(r.goodsSar).toBe(530);
    expect(r.rateDiff).toBe(10);
  });
  it("reads a supplier sheet (Chinese headers, total CBM, totals row skipped)", () => {
    const sheet = [["PROFORMA INVOICE"], ["货号", "品名", "箱数", "装箱数", "单价", "总体积"], ["JC-1", "涤纶排网 白色", 4, 50, 18, 0.72], ["JC-2", "粗涤纶排网", 6, 50, 33, 1.2], ["合计", "", 10, "", "", 1.92]];
    const r = readChinaSheet(sheet);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({ supplier_code: "JC-1", cartons: "4", per_carton: "50", unit_price: "18", carton_cbm: "0.18" });
    expect(r.totalCbm).toBe(true);
  });
  it("English headers with pieces instead of cartons", () => {
    const r = readChinaSheet([["Item No", "Description", "Qty", "Pcs/Ctn", "Unit Price", "CBM"], ["A1", "Net", 100, 25, 5.5, 0.1]]);
    expect(r.lines[0]).toMatchObject({ cartons: "4", per_carton: "25", unit_price: "5.5", carton_cbm: "0.1" });
  });
  it("reads CSV text", () => {
    expect(parseCsvRows('Code,Description\n"A,1","Net ""big"""\n')).toEqual([["Code", "Description"], ["A,1", 'Net "big"']]);
  });
});
