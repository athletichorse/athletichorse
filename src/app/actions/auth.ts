"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/admin";
import { getStaff, usernameToEmail } from "@/lib/auth";
import { LOCALE_COOKIE, getLocale } from "@/lib/locale";

export type FormState = { error?: string; ok?: boolean } | undefined;

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!username || !password) return { error: "invalid" };

  const supa = await authClient();
  const { data, error } = await supa.auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (error || !data.user) return { error: "invalid" };

  const { data: p } = await db().from("profiles").select("active, locale").eq("id", data.user.id).maybeSingle();
  if (!p?.active) {
    await supa.auth.signOut();
    return { error: "invalid" };
  }
  (await cookies()).set(LOCALE_COOKIE, p.locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  redirect("/");
}

export async function logoutAction() {
  const supa = await authClient();
  await supa.auth.signOut();
  redirect("/login");
}

/** Toggles ar ⇄ en; saves to the profile when logged in. */
export async function switchLocaleAction() {
  const next = (await getLocale()) === "ar" ? "en" : "ar";
  (await cookies()).set(LOCALE_COOKIE, next, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const s = await getStaff();
  if (s) await db().from("profiles").update({ locale: next }).eq("id", s.id);
}
