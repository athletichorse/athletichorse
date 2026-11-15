import "server-only";
import { db } from "./supabase/admin";
import { isRole, needsApproval, resolvePermissions, type APPROVAL_RULE_KEYS, type Staff } from "./permissions-server";

type Rule = (typeof APPROVAL_RULE_KEYS)[number];
export type ApprovalResult = { ok: true; approverId: string | null } | { ok: false; error: "approval_required" | "approval_invalid" | "approval_locked" };

/**
 * Manager approval (username + PIN). When `rule` applies to this person, the given
 * approver must be active, have the right PIN, hold "approval.approve" and not be the
 * person asking. Returns the approver's id to store on the document.
 */
export async function checkApproval(staff: Staff, rule: Rule, approverUsername?: string, approverPin?: string): Promise<ApprovalResult> {
  if (!needsApproval(staff.perms, rule)) return { ok: true, approverId: null };
  const u = String(approverUsername ?? "").trim().toLowerCase();
  const pin = String(approverPin ?? "").trim();
  if (!u || !pin) return { ok: false, error: "approval_required" };
  const { data: id } = await db().rpc("verify_staff_pin", { p_username: u, p_pin: pin });
  if (!id) {
    const { data: locked } = await db().rpc("staff_pin_locked", { p_username: u });
    return { ok: false, error: locked ? "approval_locked" : "approval_invalid" };
  }
  if (id === staff.id) return { ok: false, error: "approval_invalid" };
  const { data: p } = await db().from("profiles").select("role, active").eq("id", id).maybeSingle();
  if (!p?.active || !isRole(p.role)) return { ok: false, error: "approval_invalid" };
  const [{ data: rp }, { data: up }] = await Promise.all([
    db().from("role_permissions").select("permission, allowed").eq("role", p.role),
    db().from("user_permissions").select("permission, allowed").eq("user_id", id),
  ]);
  const perms = resolvePermissions(p.role, rp ?? [], up ?? []);
  if (!perms.has("approval.approve")) return { ok: false, error: "approval_invalid" };
  return { ok: true, approverId: String(id) };
}
