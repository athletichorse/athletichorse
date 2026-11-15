import { NextResponse, type NextRequest } from "next/server";
import { getStaff } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { LOCALE_COOKIE } from "@/lib/locale";

/**
 * Language switch as a plain link: /lang?to=ar&next=/products
 * Works without any page JavaScript; saves the choice to the cookie and the staff profile.
 */
export async function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get("to") === "ar" ? "ar" : "en";
  const nextPath = req.nextUrl.searchParams.get("next") || "/";
  const safe = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
  const s = await getStaff();
  if (s) await db().from("profiles").update({ locale: to }).eq("id", s.id);
  const res = NextResponse.redirect(new URL(safe, req.url), 303);
  res.cookies.set(LOCALE_COOKIE, to, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}
