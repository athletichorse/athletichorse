/** Saudi-specific validation & normalisation (phones, VAT number, CR). */

export function toLatinDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Saudi mobile → "+9665XXXXXXXX", or null if invalid.
 * Accepts 05XXXXXXXX, 5XXXXXXXX, 9665XXXXXXXX, +9665…, 009665…, spaces/dashes, Arabic digits.
 */
export function normalizeSaudiMobile(input: string): string | null {
  let s = toLatinDigits(input).replace(/[\s\-().]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("00")) s = s.slice(2);
  if (s.startsWith("966")) s = s.slice(3);
  if (s.startsWith("0")) s = s.slice(1);
  return /^5\d{8}$/.test(s) ? `+966${s}` : null;
}

/** VAT registration number: 15 digits, starts and ends with 3. */
export function isValidVatNumber(v: string): boolean {
  return /^3\d{13}3$/.test(toLatinDigits(v.trim()));
}

/** Commercial Registration (CR) number: 10 digits. */
export function isValidCrNumber(v: string): boolean {
  return /^\d{10}$/.test(toLatinDigits(v.trim()));
}
