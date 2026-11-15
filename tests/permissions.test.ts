import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APPROVAL_RULE_KEYS, PERMISSION_GROUPS, PERMISSION_KEYS, ROLES, ROLE_DEFAULTS, needsApproval, resolvePermissions } from "@/lib/permissions";
import ar from "@/i18n/ar";
import en from "@/i18n/en";

describe("permission resolution", () => {
  it("owner always has everything, overrides ignored", () => {
    const p = resolvePermissions("owner", [{ permission: "pos.collect", allowed: false }], [{ permission: "staff.edit", allowed: false }]);
    expect(p.size).toBe(PERMISSION_KEYS.length);
  });
  it("role override then user override", () => {
    expect(resolvePermissions("cashier", [], []).has("pos.collect")).toBe(true);
    expect(resolvePermissions("cashier", [{ permission: "pos.collect", allowed: false }], []).has("pos.collect")).toBe(false);
    expect(
      resolvePermissions("cashier", [{ permission: "pos.collect", allowed: false }], [{ permission: "pos.collect", allowed: true }]).has("pos.collect"),
    ).toBe(true);
  });
  it("ignores unknown keys", () => {
    expect(resolvePermissions("marketing", [{ permission: "nope.x", allowed: true }], []).has("nope.x" as never)).toBe(false);
  });
  it("approval rules: cashier needs approval, manager does not", () => {
    const cashier = resolvePermissions("cashier", [], []);
    const manager = resolvePermissions("manager", [], []);
    for (const r of APPROVAL_RULE_KEYS) {
      expect(needsApproval(cashier, r)).toBe(true);
      expect(needsApproval(manager, r)).toBe(false);
    }
    const off = resolvePermissions("cashier", [], [{ permission: "approval.return", allowed: false }]);
    expect(needsApproval(off, "approval.return")).toBe(false);
  });
  it("only the owner can edit permissions by default", () => {
    for (const r of ROLES) expect(ROLE_DEFAULTS[r].includes("permissions.edit")).toBe(r === "owner");
  });
  it("every key appears in exactly one display group", () => {
    const all = Object.values(PERMISSION_GROUPS).flat();
    expect([...all].sort()).toEqual([...PERMISSION_KEYS].sort());
  });
});

describe("consistency", () => {
  it("SQL role list matches ROLES", () => {
    const sql = readFileSync("supabase/migrations/0001_core.sql", "utf8");
    const lists = [...sql.matchAll(/role in\s*\(([^)]*)\)/g)].map((m) => m[1].match(/'([a-z_]+)'/g)!.map((s) => s.slice(1, -1)));
    expect(lists.length).toBeGreaterThanOrEqual(2);
    for (const l of lists) expect(l).toEqual([...ROLES]);
  });
  it("ar and en have the same keys, and every permission has a label", () => {
    const keys = (o: object, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(en).sort()).toEqual(keys(ar).sort());
    for (const k of PERMISSION_KEYS) expect(ar.perms.keys[k]).toBeTruthy();
    for (const r of ROLES) expect(ar.roles[r]).toBeTruthy();
  });
});
