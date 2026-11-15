import { describe, expect, it } from "vitest";
import { POS_DEFAULTS, parsePosSettingsForm, readPosSettings } from "@/lib/pos-settings";
import { TILL_ROLES, ROLE_DEFAULTS } from "@/lib/permissions";
import { buildNav } from "@/components/menu";
import en from "@/i18n/en";
import { resolvePermissions } from "@/lib/permissions";

const form = (o: Record<string, string>) => (k: string) => o[k] ?? null;
const good = { receipt_paper_mm: "80", receipt_width_mm: "70", late_allowed: "3", late_day_value: "0.25", absence_days: "1", unexcused_absence_days: "2", overtime_rate: "1" };

describe("cashier settings", () => {
  it("reads stored values and falls back to the defaults", () => {
    const s = readPosSettings([{ key: "receipt_paper_mm", value: 58 }, { key: "block_negative_stock", value: false }, { key: "late_day_value", value: "x" }, { key: "vat_rate", value: "15.00" }]);
    expect(s.receipt_paper_mm).toBe(58);
    expect(s.block_negative_stock).toBe(false);
    expect(s.late_day_value).toBe(POS_DEFAULTS.late_day_value);
    expect(s.overtime_rate).toBe(1);
  });
  it("parses the form, accepts Arabic digits, checks ranges", () => {
    const r = parsePosSettingsForm(form({ ...good, late_allowed: "٤", block_negative_stock: "on", receipt_footer_ar: "  الاسترجاع خلال 7 أيام " }));
    expect(r.ok && r.values.late_allowed).toBe(4);
    expect(r.ok && r.values.block_negative_stock).toBe(true);
    expect(r.ok && r.values.receipt_footer_ar).toBe("الاسترجاع خلال 7 أيام");
    expect(parsePosSettingsForm(form({ ...good, overtime_rate: "-1" }))).toEqual({ ok: false, field: "overtime_rate" });
    expect(parsePosSettingsForm(form({ ...good, receipt_width_mm: "90" }))).toEqual({ ok: false, field: "receipt_width_mm" });
    const off = parsePosSettingsForm(form(good));
    expect(off.ok && off.values.block_negative_stock).toBe(false);
  });
});

describe("till staff menu", () => {
  it("cashier, desk and cashier+desk see only Cashier and Stores", () => {
    for (const r of TILL_ROLES) {
      const nav = buildNav(en, resolvePermissions(r, [], []), r);
      expect(nav.main.map((x) => x.href)).toEqual(["/pos", "/stock"]);
      expect(nav.admin).toEqual([]);
    }
  });
  it("till staff need the customer by default; managers may skip it", () => {
    for (const r of TILL_ROLES) expect(ROLE_DEFAULTS[r].includes("pos.skip_customer")).toBe(false);
    expect(ROLE_DEFAULTS.manager.includes("pos.skip_customer")).toBe(true);
  });
});
