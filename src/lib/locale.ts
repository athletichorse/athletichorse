import "server-only";
import { cookies } from "next/headers";
import { dictionaries, isLocale, type Locale } from "@/i18n";
import { getStaff } from "./auth";

export const LOCALE_COOKIE = "locale";

/** Staff profile locale → cookie → Arabic. */
export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  const s = await getStaff();
  return s?.locale ?? "ar";
}

export async function getDict() {
  const locale = await getLocale();
  return { locale, t: dictionaries[locale] };
}
