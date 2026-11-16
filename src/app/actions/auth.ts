"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/admin";
import { usernameToEmail } from "@/lib/auth";
import { ensureDeviceKey, userAgent } from "@/lib/device";
import { LOCALE_COOKIE } from "@/lib/locale";

export type FormState = { error?: string; ok?: boolean } | undefined;

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!username || !password) return { error: "invalid" };

  const device = await ensureDeviceKey(); // before signing in, so the device can be approved
  const supa = await authClient();
  const { data, error } = await supa.auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (error || !data.user) return { error: "invalid" };
  const { data: verdict, error: e2 } = await db().rpc("check_access", { p_profile: data.user.id, p_device_key: device, p_user_agent: await userAgent() });
  if (!e2 && (verdict === "hours" || verdict === "device")) {
    await supa.auth.signOut();
    return { error: verdict };
  }

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
