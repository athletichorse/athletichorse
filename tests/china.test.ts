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
  it("reads a real proforma: untitled code column, two description columns, merged cells, ¥ prices", () => {
    const H = ["货物描述 DESCRION OF GOODS", "", "图片 PIC", "货物描述 DESCRION OF GOODS", "箱数 CTNS", "每箱数量 QTY/CTN", "总数量 T.T.QTY.", "单位 UNIT", "单价 UNITPRICE", "金额（元） T.T.AMT.", "每件体积 MEASURE/CTN", "总体积 bulk volume", "毛重KG"];
    const sheet = [["PROFORMA INVOICE"], H,
      ["金城体育25853", "JC-1", "", "涤纶排网 白色", 4, 50, 200, "pcs", "￥18.00", "￥3,600.00", 0.18, 0.72],
      ["", "JC-2", "", "粗涤纶排网 黑色", 6, 50, 300, "pcs", 33, 9900, 0.2, 1.2],
      ["", "JC-3", "", "4KG粗编织绳排网", 4, 13, 52, "pcs", 98, 5096, 0.15, 0.6],
      ["", "", "", "", 4, 12, 48, "pcs", 98, 4704, 0.18, 0.7],
      ["亿翔", "YX-1", "", "篮球", 5, 1, 5, "pcs", 720, 3600, 0.23, 1.15],
      ["合计", "", "", "", 23, "", 605, "", "", 26900, "", 4.27]];
    const r = readChinaSheet(sheet);
    expect(r.lines.map((l) => `${l.supplier_code}|${l.description}|${l.cartons}x${l.per_carton}|${l.unit_price}|${l.carton_cbm}`)).toEqual([
      "JC-1|涤纶排网 白色|4x50|18|0.18",
      "JC-2|粗涤纶排网 黑色|6x50|33|0.2",
      "JC-3|4KG粗编织绳排网|4x13|98|0.15",
      "JC-3|4KG粗编织绳排网|4x12|98|0.18",
      "YX-1|篮球|5x1|720|0.23",
    ]);
  });
});
