import { describe, expect, it } from "vitest";
import { RULES, applyRule } from "@/lib/stock-rules";
import { viewableLocations } from "@/components/StockTabs";

describe("shortages rules", () => {
  it("supports = ≠ > ≥ < ≤", () => {
    expect(RULES).toEqual(["=", "!=", ">", ">=", "<", "<="]);
    expect([0, 1, 2].filter((q) => applyRule(q, "=", 1))).toEqual([1]);
    expect([0, 1, 2].filter((q) => applyRule(q, "!=", 1))).toEqual([0, 2]);
    expect([0, 1, 2].filter((q) => applyRule(q, ">", 1))).toEqual([2]);
    expect([0, 1, 2].filter((q) => applyRule(q, ">=", 1))).toEqual([1, 2]);
    expect([0, 1, 2].filter((q) => applyRule(q, "<", 1))).toEqual([0]);
    expect([-1, 0, 1, 2].filter((q) => applyRule(q, "<=", 0))).toEqual([-1, 0]);
  });
});

describe("who can look at which stock", () => {
  const all = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("own branch only, unless 'stock of all branches' or all locations", () => {
    expect(viewableLocations(all, { locations: ["b"], perms: new Set() }).map((x) => x.id)).toEqual(["b"]);
    expect(viewableLocations(all, { locations: ["b"], perms: new Set(["stock.all_locations"]) }).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(viewableLocations(all, { locations: "all", perms: new Set() })).toHaveLength(3);
  });
});
