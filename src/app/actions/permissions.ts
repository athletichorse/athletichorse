"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { PERMISSION_KEYS, isRole } from "@/lib/permissions";

/** Form fields "p:<key>" = "" (default) | "1" (allow) | "0" (deny). */
function readChoices(form: FormData, actorIsOwner: boolean) {
  const set: { permission: string; allowed: boolean }[] = [];
  const clear: string[] = [];
  for (const key of PERMISSION_KEYS) {
    if (key === "permissions.edit" && !actorIsOwner) continue; // only the owner hands out this one
    const v = form.get(`p:${key}`);
    if (v === "1" || v === "0") set.push({ permission: key, allowed: v === "1" });
    else if (v === "") clear.push(key);
  }
  return { set, clear };
}

export async function saveRolePermissionsAction(form: FormData) {
  const actor = await assertPermission("permissions.edit");
  const role = String(form.get("role") ?? "");
  if (!isRole(role) || role === "owner") redirect("/permissions");
  const { set, clear } = readChoices(form, actor.role === "owner");
  if (clear.length) await db().from("role_permissions").delete().eq("role", role).in("permission", clear);
  if (set.length) {
    const { error } = await db().from("role_permissions").upsert(set.map((s) => ({ ...s, role, updated_by: actor.id, updated_at: new Date().toISOString() })));
    if (error) redirect(`/permissions?role=${role}&err=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/permissions");
  redirect(`/permissions?role=${role}&ok=1`);
}

export async function saveUserPermissionsAction(form: FormData) {
  const actor = await assertPermission("permissions.edit");
  const userId = String(form.get("user_id") ?? "");
  const { data: target } = await db().from("profiles").select("id, role").eq("id", userId).maybeSingle();
  if (!target || target.role === "owner") redirect("/permissions?tab=user");
  const { set, clear } = readChoices(form, actor.role === "owner");
  if (clear.length) await db().from("user_permissions").delete().eq("user_id", userId).in("permission", clear);
  if (set.length) {
    const { error } = await db().from("user_permissions").upsert(set.map((s) => ({ ...s, user_id: userId, updated_by: actor.id, updated_at: new Date().toISOString() })));
    if (error) redirect(`/permissions?tab=user&user=${userId}&err=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/permissions");
  redirect(`/permissions?tab=user&user=${userId}&ok=1`);
}
