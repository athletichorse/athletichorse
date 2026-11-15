import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64, decodeZatcaQr, encodeZatcaQr, zatcaTimestamp } from "@/lib/zatca";

describe("ZATCA Phase 1 QR (TLV base64)", () => {
  it("matches the published ZATCA example", () => {
    const qr = encodeZatcaQr({
      sellerName: "Bobs Records",
      vatNumber: "310122393500003",
      timestamp: "2022-04-25T15:30:00Z",
      totalWithVat: "1000.00",
      vatTotal: "150.00",
    });
    expect(qr).toBe("AQxCb2JzIFJlY29yZHMCDzMxMDEyMjM5MzUwMDAwMwMUMjAyMi0wNC0yNVQxNTozMDowMFoEBzEwMDAuMDAFBjE1MC4wMA==");
  });

  it("agrees with Node's Buffer base64 and uses UTF-8 byte lengths for Arabic", () => {
    const input = { sellerName: "شركة المثال للتجارة", vatNumber: "300000000000003", timestamp: zatcaTimestamp(new Date("2026-11-13T09:30:00.123Z")), totalWithVat: "115.00", vatTotal: "15.00" };
    const qr = encodeZatcaQr(input);
    const raw = Buffer.from(qr, "base64");
    expect(raw[0]).toBe(1);
    expect(raw[1]).toBe(Buffer.byteLength(input.sellerName, "utf8"));
    expect(decodeZatcaQr(qr)).toEqual({ 1: input.sellerName, 2: input.vatNumber, 3: "2026-11-13T09:30:00Z", 4: "115.00", 5: "15.00" });
  });

  it("base64 round-trips all lengths", () => {
    for (let n = 0; n < 20; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 255);
      const b64 = bytesToBase64(bytes);
      expect(b64).toBe(Buffer.from(bytes).toString("base64"));
      expect([...base64ToBytes(b64)]).toEqual([...bytes]);
    }
  });

  it("rejects values longer than 255 bytes", () => {
    expect(() => encodeZatcaQr({ sellerName: "x".repeat(256), vatNumber: "3", timestamp: "t", totalWithVat: "1", vatTotal: "0" })).toThrow();
  });
});
