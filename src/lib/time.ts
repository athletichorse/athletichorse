/** Time helpers — everything "today" is in Asia/Riyadh (UTC+3, no DST). */

export const TZ = "Asia/Riyadh";

/** YYYY-MM-DD in Riyadh. */
export function riyadhDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** 0=Sun … 6=Sat, in Riyadh. */
export function riyadhWeekday(d: Date = new Date()): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

/** Saudi weekend: Friday & Saturday (configurable via settings.weekend_days). */
export function isWeekend(d: Date = new Date(), weekendDays: readonly number[] = [5, 6]): boolean {
  return weekendDays.includes(riyadhWeekday(d));
}

export function formatDateTime(d: Date, locale: "ar" | "en" = "ar"): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", {
    timeZone: TZ,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/** Hijri (Umm al-Qura) date, e.g. "٢٢ جمادى الأولى ١٤٤٨ هـ". */
export function formatHijri(d: Date, locale: "ar" | "en" = "ar"): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-islamic-umalqura-nu-latn" : "en-u-ca-islamic-umalqura", {
    timeZone: TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}
