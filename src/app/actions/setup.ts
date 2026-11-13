"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase/admin";
import { usernameToEmail } from "@/lib/auth";
import { authClient } from "@/lib/supabase/server";
import type { FormState } from "./auth";

export async function ownerExists(): Promise<boolean> {
  const { count, error } = await db().from("profiles").select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

function sameSecret(a: string, b: string) {
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(a), h(b));
}

/** One-time: creates the first owner. Disabled as soon as any profile exists. */
export async function setupOwnerAction(_: FormState, form: FormData): Promise<FormState> {
  const expected = process.env.SETUP_SECRET;
  if (!expected || expected.length < 12) return { error: "SETUP_SECRET is not set (min 12 chars) in Vercel." };
  if (!sameSecret(String(form.get("secret") ?? ""), expected)) return { error: "badSecret" };
  if (await ownerExists()) return { error: "done" };

  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const fullName = String(form.get("full_name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const pin = String(form.get("pin") ?? "");
  const branchId = String(form.get("branch_id") ?? "") || null;
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return { error: "username: 3–32 a-z 0-9 . _ -" };
  if (!fullName) return { error: "full name" };
  if (password.length < 10) return { error: "password: min 10" };
  if (!/^\d{4,8}$/.test(pin)) return { error: "PIN: 4–8 digits" };

  const { data: created, error: e1 } = await db().auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
  });
  if (e1 || !created.user) return { error: e1?.message ?? "auth" };

  const { error: e2 } = await db().from("profiles").insert({
    id: created.user.id,
    username,
    full_name: fullName,
    role: "owner",
    branch_id: branchId,
  });
  if (e2) {
    await db().auth.admin.deleteUser(created.user.id);
    return { error: e2.message };
  }
  await db().rpc("set_staff_pin", { p_user: created.user.id, p_pin: pin });

  const supa = await authClient();
  await supa.auth.signInWithPassword({ email: usernameToEmail(username), password });
  redirect("/");
}
