import { describe, expect, it } from "vitest";
import { isValidCrNumber, isValidVatNumber, normalizeSaudiMobile } from "@/lib/saudi";
import { isWeekend, riyadhDate } from "@/lib/time";

describe("Saudi mobile numbers", () => {
  it.each([
    ["0501234567", "+966501234567"],
    ["501234567", "+966501234567"],
    ["+966501234567", "+966501234567"],
    ["00966 50 123 4567", "+966501234567"],
    ["966-55-123-4567", "+966551234567"],
    ["٠٥٠١٢٣٤٥٦٧", "+966501234567"],
  ])("%s → %s", (input, out) => expect(normalizeSaudiMobile(input)).toBe(out));
  it.each(["0112345678", "05012345", "+201001234567", "", "0601234567"])("rejects %s", (x) =>
    expect(normalizeSaudiMobile(x)).toBeNull(),
  );
});

describe("VAT & CR numbers", () => {
  it("VAT: 15 digits, starts and ends with 3", () => {
    expect(isValidVatNumber("310122393500003")).toBe(true);
    expect(isValidVatNumber("310122393500004")).toBe(false);
    expect(isValidVatNumber("210122393500003")).toBe(false);
    expect(isValidVatNumber("31012239350003")).toBe(false);
  });
  it("CR: 10 digits", () => {
    expect(isValidCrNumber("1010123456")).toBe(true);
    expect(isValidCrNumber("101012345")).toBe(false);
  });
});

describe("Riyadh time", () => {
  it("'today' uses Asia/Riyadh (UTC+3)", () => {
    expect(riyadhDate(new Date("2026-11-13T21:30:00Z"))).toBe("2026-11-14");
    expect(riyadhDate(new Date("2026-11-13T20:59:00Z"))).toBe("2026-11-13");
  });
  it("weekend is Friday–Saturday", () => {
    expect(isWeekend(new Date("2026-11-13T10:00:00Z"))).toBe(true); // Friday
    expect(isWeekend(new Date("2026-11-14T10:00:00Z"))).toBe(true); // Saturday
    expect(isWeekend(new Date("2026-11-15T10:00:00Z"))).toBe(false); // Sunday
  });
});
