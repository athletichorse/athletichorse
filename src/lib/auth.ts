import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "./supabase/admin";
import { authClient } from "./supabase/server";
import { isRole, resolvePermissions, type PermissionKey, type Role } from "./permissions";
import type { Locale } from "@/i18n";

/** Usernames are mapped to internal e-mail addresses for Supabase Auth. */
export const USERNAME_EMAIL_DOMAIN = "staff.portal.local";
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;

export type Staff = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  branchId: string | null;
  locale: Locale;
  perms: Set<PermissionKey>;
};

/** Current staff member, or null. Cached per request. */
export const getStaff = cache(async (): Promise<Staff | null> => {
  const supa = await authClient();
  const { data } = await supa.auth.getUser(); // verifies the JWT with Supabase
  const uid = data.user?.id;
  if (!uid) return null;

  const { data: p } = await db()
    .from("profiles")
    .select("id, username, full_name, role, branch_id, locale, active")
    .eq("id", uid)
    .maybeSingle();
  if (!p || !p.active || !isRole(p.role)) return null;

  const [{ data: rp }, { data: up }] = await Promise.all([
    db().from("role_permissions").select("permission, allowed").eq("role", p.role),
    db().from("user_permissions").select("permission, allowed").eq("user_id", uid),
  ]);

  return {
    id: p.id,
    username: p.username,
    fullName: p.full_name,
    role: p.role,
    branchId: p.branch_id,
    locale: p.locale === "en" ? "en" : "ar",
    perms: resolvePermissions(p.role, rp ?? [], up ?? []),
  };
});

/** Use at the top of every protected page and server action. */
export async function requireStaff(): Promise<Staff> {
  const s = await getStaff();
  if (!s) redirect("/login");
  return s;
}

export class ForbiddenError extends Error {
  constructor(public key: PermissionKey) {
    super(`Missing permission: ${key}`);
  }
}

/** requireStaff() + permission check. Pages: redirect to /forbidden. */
export async function requirePermission(key: PermissionKey): Promise<Staff> {
  const s = await requireStaff();
  if (!s.perms.has(key)) redirect(`/forbidden?k=${encodeURIComponent(key)}`);
  return s;
}

/** Same as requirePermission but throws (for server actions returning errors). */
export async function assertPermission(key: PermissionKey): Promise<Staff> {
  const s = await requireStaff();
  if (!s.perms.has(key)) throw new ForbiddenError(key);
  return s;
}
