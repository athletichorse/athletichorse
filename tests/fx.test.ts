import { describe, expect, it } from "vitest";
import { expectedSar, readRates } from "@/lib/fx";

describe("exchange rates", () => {
  it("reads saved rates, keeps SAR = 1, ignores junk", () => {
    expect(readRates({ CNY: "0.52", bad: 3, EUR: -1, SAR: 9 })).toEqual({ SAR: 1, USD: 3.75, CNY: 0.52 });
  });
  it("expected purchase price = China price × rate", () => {
    const r = readRates({ CNY: 0.52 });
    expect(expectedSar(18, "CNY", r)).toBe(9.36);
    expect(expectedSar(18, "EGP", r)).toBeNull();
    expect(expectedSar(null, "CNY", r)).toBeNull();
  });
});
