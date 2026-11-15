import "server-only";
import { cookies } from "next/headers";
import { dictionaries, isLocale, type Locale } from "@/i18n";
import { getStaff } from "./auth";

export const LOCALE_COOKIE = "locale";

/** Logged-in staff: their profile language. Otherwise the cookie. Default: English. */
export async function getLocale(): Promise<Locale> {
  const s = await getStaff();
  if (s) return s.locale;
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(c) ? c : "en";
}

export async function getDict() {
  const locale = await getLocale();
  return { locale, t: dictionaries[locale] };
}
