import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "./supabase/admin";
import { authClient } from "./supabase/server";
import { deviceKey, userAgent } from "./device";
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
  /** Locations this person may see / work at: "all", or a list of location ids. */
  locations: "all" | string[];
  locale: Locale;
  perms: Set<PermissionKey>;
  /** Outside working hours or on a device that isn't approved (never the owner). */
  blocked: "hours" | "device" | null;
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

  const [{ data: rp }, { data: up }, { data: extra }, { data: sl }] = await Promise.all([
    db().from("role_permissions").select("permission, allowed").eq("role", p.role),
    db().from("user_permissions").select("permission, allowed").eq("user_id", uid),
    // Tolerant of databases that don't have migration 0005 yet (errors → defaults).
    db().from("profiles").select("all_locations").eq("id", uid).maybeSingle(),
    db().from("staff_locations").select("location_id").eq("user_id", uid),
  ]);
  const allLocations = p.role === "owner" || extra?.all_locations === true;
  const locations = allLocations
    ? ("all" as const)
    : [...new Set([p.branch_id, ...(sl ?? []).map((r) => r.location_id)].filter((x): x is string => Boolean(x)))];

  // الرقابة: working hours + approved devices (a database without 0014 simply skips this)
  let blocked: Staff["blocked"] = null;
  if (p.role !== "owner") {
    const { data: verdict, error } = await db().rpc("check_access", { p_profile: uid, p_device_key: await deviceKey(), p_user_agent: await userAgent() });
    if (!error && (verdict === "hours" || verdict === "device")) blocked = verdict;
  }

  return {
    blocked,
    id: p.id,
    username: p.username,
    fullName: p.full_name,
    role: p.role,
    branchId: p.branch_id,
    locations,
    locale: p.locale === "ar" ? "ar" : "en",
    perms: resolvePermissions(p.role, rp ?? [], up ?? []),
  };
});

/** Use at the top of every protected page and server action. */
export async function requireStaff(): Promise<Staff> {
  const s = await getStaff();
  if (!s) redirect("/login");
  if (s.blocked) redirect(`/blocked?r=${s.blocked}`);
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

/** True when this person may see / work at the given location. */
export function canUseLocation(s: Pick<Staff, "locations">, locationId: string): boolean {
  return s.locations === "all" || s.locations.includes(locationId);
}
