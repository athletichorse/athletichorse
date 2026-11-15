import { describe, expect, it } from "vitest";
import { code128Svg, code128Values, code128Widths } from "@/lib/barcode";

describe("Code 128-B", () => {
  it("encodes with the right checksum", () => {
    // Start B=104, W=55 i=73 k=75 i=73 p=80 e=69 d=68 i=73 a=65
    // (104 + 55·1 + 73·2 + 75·3 + 73·4 + 80·5 + 69·6 + 68·7 + 73·8 + 65·9) = 3281; 3281 mod 103 = 88
    expect(code128Values("Wikipedia")).toEqual([104, 55, 73, 75, 73, 80, 69, 68, 73, 65, 88, 106]);
  });
  it("invoice number", () => {
    const v = code128Values("BR01-000001");
    expect(v[0]).toBe(104);
    expect(v.at(-1)).toBe(106);
    expect(v.length).toBe("BR01-000001".length + 3);
  });
  it("every symbol is 11 modules wide, stop is 13", () => {
    const w = code128Widths("AB");
    expect(w.reduce((a, b) => a + b, 0)).toBe(11 * 4 + 13);
  });
  it("renders an SVG", () => expect(code128Svg("BR01-000001")).toMatch(/^<svg[\s\S]*<rect/));
  it("refuses Arabic", () => expect(() => code128Values("فاتورة")).toThrow());
});
