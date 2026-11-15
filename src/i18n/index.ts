import ar, { type Dict } from "./ar";
import en from "./en";

export type Locale = "ar" | "en";
export const LOCALES: readonly Locale[] = ["ar", "en"];
export const dictionaries: Record<Locale, Dict> = { ar, en };

export function isLocale(x: unknown): x is Locale {
  return x === "ar" || x === "en";
}
export function dirOf(l: Locale): "rtl" | "ltr" {
  return l === "ar" ? "rtl" : "ltr";
}
export type { Dict };
