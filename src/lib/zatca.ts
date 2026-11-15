/**
 * ZATCA Phase 1 QR code: TLV (tag, length, UTF-8 value) → base64.
 *   1 seller name · 2 VAT number · 3 ISO-8601 timestamp · 4 total incl. VAT · 5 VAT total
 * Works in the browser and on the server (no Node Buffer needed).
 */

export type ZatcaQrInput = {
  sellerName: string;
  vatNumber: string;
  timestamp: string | Date; // ISO 8601
  totalWithVat: string; // "1150.00"
  vatTotal: string; // "150.00"
};

const enc = new TextEncoder();
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += b === undefined ? "=" : B64[(n >> 6) & 63];
    out += c === undefined ? "=" : B64[n & 63];
  }
  return out;
}

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/=+$/, "");
  const out: number[] = [];
  let buf = 0, bits = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new Error("Invalid base64");
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

function tlv(tag: number, value: string): Uint8Array {
  const v = enc.encode(value);
  if (v.length > 255) throw new Error(`ZATCA TLV value for tag ${tag} is longer than 255 bytes`);
  const out = new Uint8Array(v.length + 2);
  out[0] = tag;
  out[1] = v.length;
  out.set(v, 2);
  return out;
}

/** ISO timestamp without milliseconds, e.g. 2026-11-13T09:30:00Z. */
export function zatcaTimestamp(t: string | Date): string {
  const d = typeof t === "string" ? new Date(t) : t;
  if (Number.isNaN(d.getTime())) throw new Error("Invalid timestamp");
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function encodeZatcaQr(input: ZatcaQrInput): string {
  const parts = [
    tlv(1, input.sellerName),
    tlv(2, input.vatNumber),
    tlv(3, typeof input.timestamp === "string" ? input.timestamp : zatcaTimestamp(input.timestamp)),
    tlv(4, input.totalWithVat),
    tlv(5, input.vatTotal),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const all = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    all.set(p, off);
    off += p.length;
  }
  return bytesToBase64(all);
}

export function decodeZatcaQr(b64: string): Record<number, string> {
  const bytes = base64ToBytes(b64);
  const dec = new TextDecoder();
  const out: Record<number, string> = {};
  let i = 0;
  while (i < bytes.length) {
    const tag = bytes[i], len = bytes[i + 1];
    out[tag] = dec.decode(bytes.slice(i + 2, i + 2 + len));
    i += 2 + len;
  }
  return out;
}
