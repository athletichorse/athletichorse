"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission, usernameToEmail } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { isRole } from "@/lib/permissions";
import { normalizeSaudiMobile } from "@/lib/saudi";

const back = (err?: string) => redirect(err ? `/staff?err=${encodeURIComponent(err)}` : "/staff?ok=1");

function readCommon(form: FormData) {
  const role = String(form.get("role") ?? "");
  const phoneRaw = String(form.get("phone") ?? "").trim();
  const phone = phoneRaw ? normalizeSaudiMobile(phoneRaw) : null;
  return {
    full_name: String(form.get("full_name") ?? "").trim(),
    role,
    branch_id: String(form.get("branch_id") ?? "") || null,
    locale: form.get("locale") === "en" ? "en" : "ar",
    phone,
    phoneInvalid: Boolean(phoneRaw) && !phone,
  };
}

export async function createStaffAction(form: FormData) {
  const actor = await assertPermission("staff.edit");
  const c = readCommon(form);
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const pin = String(form.get("pin") ?? "");
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return back("username");
  if (!c.full_name) return back("full_name");
  if (!isRole(c.role)) return back("role");
  if (c.role === "owner" && actor.role !== "owner") return back("owner_only");
  if (c.phoneInvalid) return back("phone");
  if (password.length < 8) return back("password_min_8");
  if (pin && !/^\d{4,8}$/.test(pin)) return back("pin");

  const { data, error } = await db().auth.admin.createUser({ email: usernameToEmail(username), password, email_confirm: true });
  if (error || !data.user) return back(error?.message ?? "auth");
  const { phoneInvalid: _p, ...row } = c;
  void _p;
  const { error: e2 } = await db().from("profiles").insert({ id: data.user.id, username, ...row });
  if (e2) {
    await db().auth.admin.deleteUser(data.user.id);
    return back(e2.message);
  }
  if (pin) await db().rpc("set_staff_pin", { p_user: data.user.id, p_pin: pin });
  revalidatePath("/staff");
  back();
}

export async function updateStaffAction(form: FormData) {
  const actor = await assertPermission("staff.edit");
  const id = String(form.get("id") ?? "");
  const c = readCommon(form);
  const active = form.get("active") === "on";
  const password = String(form.get("password") ?? "");
  const pin = String(form.get("pin") ?? "");

  const { data: target } = await db().from("profiles").select("id, role").eq("id", id).maybeSingle();
  if (!target) return back("not_found");
  if ((target.role === "owner" || c.role === "owner") && actor.role !== "owner") return back("owner_only");
  if (!isRole(c.role)) return back("role");
  if (id === actor.id && (!active || c.role !== actor.role)) return back("cannot_change_self");
  if (c.phoneInvalid) return back("phone");
  if (pin && !/^\d{4,8}$/.test(pin)) return back("pin");

  const { phoneInvalid: _p, ...row } = c;
  void _p;
  const { error } = await db().from("profiles").update({ ...row, active }).eq("id", id);
  if (error) return back(error.message);
  if (password) {
    if (password.length < 8) return back("password_min_8");
    const { error: e } = await db().auth.admin.updateUserById(id, { password });
    if (e) return back(e.message);
  }
  if (pin) await db().rpc("set_staff_pin", { p_user: id, p_pin: pin });
  if (!active) await db().auth.admin.signOut(id).catch(() => undefined);
  revalidatePath("/staff");
  back();
}
