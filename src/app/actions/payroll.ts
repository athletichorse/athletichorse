"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission, requireStaff } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY = /^\d{1,9}(\.\d{1,2})?$/;
const MONTH = /^\d{4}-\d{2}-01$/;
const STATUSES = ["present", "late", "absent", "unexcused", "leave", "off"] as const;
type Res = { ok: true } | { ok: false; error: string };
const sqlErr = (m: string) => (m.match(/(payroll_locked|commission_locked|already_paid|not_approved|not_found|bad_month|The shift is not open)/)?.[1] ?? m);

/** Pay settings for one staff member (salary, hours, commission, allowances). */
export async function saveEmployeeAction(form: FormData) {
  const s = await assertPermission("staff.payroll_edit");
  const id = String(form.get("profile_id") ?? "");
  const back = (e?: string) => redirect(`/staff/employees${e ? `?err=${encodeURIComponent(e)}` : "?ok=1"}#${id}`);
  if (!UUID.test(id)) return back("bad_request");
  const num = (k: string, re = MONEY) => { const v = String(form.get(k) ?? "0").trim() || "0"; return re.test(v) ? v : null; };
  const salary = num("monthly_salary"), hours = num("daily_hours", /^\d{1,2}(\.\d{1,2})?$/), reg = num("regularity_bonus"), food = num("food_allowance");
  // commission written as 6/1000 or 0.6% or 0.006
  const rateRaw = String(form.get("commission_rate") ?? "0").trim().replace(/\s/g, "");
  const rate = /^\d+\/\d+$/.test(rateRaw) ? Number(rateRaw.split("/")[0]) / Number(rateRaw.split("/")[1]) : rateRaw.endsWith("%") ? Number(rateRaw.slice(0, -1)) / 100 : Number(rateRaw || "0");
  if (salary === null || hours === null || Number(hours) <= 0 || reg === null || food === null || !Number.isFinite(rate) || rate < 0 || rate >= 1) return back("bad_value");
  const { error } = await db().from("employees").upsert({
    profile_id: id, monthly_salary: salary, daily_hours: hours, commission_rate: Math.round(rate * 1_000_000) / 1_000_000,
    commission_scope: form.get("commission_scope") === "all" ? "all" : "own", regularity_bonus: reg, food_allowance: food,
    is_salesperson: form.get("is_salesperson") === "on", bank_account: String(form.get("bank_account") ?? "").slice(0, 60), active: form.get("active") !== "off", updated_at: new Date().toISOString(),
  });
  if (error) return back(error.message);
  await audit(s.id, "employee.update", "profile", id, { salary, rate });
  revalidatePath("/staff/employees");
  back();
}

/** Attendance sheet: many cells at once. */
export async function saveAttendanceAction(rows: { profileId: string; day: string; status: string; overtime: string }[]): Promise<Res> {
  const s = await assertPermission("staff.salespeople");
  const clean = (Array.isArray(rows) ? rows : []).slice(0, 5000).filter((r) => UUID.test(r.profileId) && /^\d{4}-\d{2}-\d{2}$/.test(r.day));
  const set = clean.filter((r) => (STATUSES as readonly string[]).includes(r.status));
  if (set.some((r) => !/^\d{1,2}(\.\d{1,2})?$/.test(String(r.overtime || "0")))) return { ok: false, error: "bad_value" };
  for (let i = 0; i < set.length; i += 500) {
    const { error } = await db().from("attendance").upsert(set.slice(i, i + 500).map((r) => ({ profile_id: r.profileId, day: r.day, status: r.status, overtime_hours: r.overtime || "0", updated_by: s.id, updated_at: new Date().toISOString() })));
    if (error) return { ok: false, error: error.message };
  }
  await audit(s.id, "attendance.save", "attendance", null, { cells: set.length });
  revalidatePath("/staff/attendance");
  return { ok: true };
}

export async function addAdvanceAction(form: FormData) {
  const s = await assertPermission("staff.payroll_edit");
  const back = (e?: string) => redirect(`/staff/advances${e ? `?err=${encodeURIComponent(e)}` : "?ok=1"}`);
  const who = String(form.get("profile_id") ?? ""), amount = String(form.get("amount") ?? "").trim(), inst = String(form.get("installment") ?? "").trim();
  if (!UUID.test(who) || !MONEY.test(amount) || !MONEY.test(inst) || Number(amount) <= 0 || Number(inst) <= 0) return back("bad_value");
  const { error } = await db().from("advances").insert({ client_id: crypto.randomUUID(), profile_id: who, amount, installment: inst, note: String(form.get("note") ?? "").slice(0, 200), created_by: s.id });
  if (error) return back(error.message);
  await audit(s.id, "advance.add", "profile", who, { amount, installment: inst });
  revalidatePath("/staff/advances");
  back();
}

export async function addAdjustmentAction(form: FormData) {
  const s = await assertPermission("staff.payroll_edit");
  const back = (e?: string) => redirect(`/staff/advances${e ? `?err=${encodeURIComponent(e)}` : "?ok=1"}`);
  const who = String(form.get("profile_id") ?? ""), amount = String(form.get("amount") ?? "").trim(), month = `${String(form.get("month") ?? "")}-01`;
  const kind = form.get("kind") === "deduction" ? "deduction" : "bonus";
  if (!UUID.test(who) || !MONEY.test(amount) || Number(amount) <= 0 || !MONTH.test(month)) return back("bad_value");
  const { error } = await db().from("pay_adjustments").insert({ client_id: crypto.randomUUID(), profile_id: who, month, kind, amount, note: String(form.get("note") ?? "").slice(0, 200), created_by: s.id });
  if (error) return back(error.message);
  await audit(s.id, `pay.${kind}`, "profile", who, { amount, month });
  revalidatePath("/staff/advances");
  back();
}

/** Build / refresh a draft sheet (payroll or commission) for a month. */
export async function computeSheetAction(sheet: "payroll" | "commission", month: string): Promise<Res> {
  const s = await assertPermission("staff.payroll_edit");
  if (!MONTH.test(month)) return { ok: false, error: "bad_month" };
  const { error } = await db().rpc(sheet === "payroll" ? "compute_payroll" : "compute_commission", { p_month: month, p_user: s.id });
  if (error) return { ok: false, error: sqlErr(error.message) };
  revalidatePath(`/staff/${sheet}`);
  return { ok: true };
}

/** Approve or reopen a sheet. */
export async function setSheetStatusAction(sheet: "payroll" | "commission", month: string, status: "approved" | "draft"): Promise<Res> {
  const s = await assertPermission("staff.payroll_edit");
  if (!MONTH.test(month)) return { ok: false, error: "bad_month" };
  const { error } = await db().rpc("set_pay_sheet_status", { p_sheet: sheet, p_month: month, p_status: status, p_user: s.id });
  if (error) return { ok: false, error: sqlErr(error.message) };
  revalidatePath(`/staff/${sheet}`);
  return { ok: true };
}

/** Pay one line from the drawer (your open shift) or the bank. */
export async function payLineAction(sheet: "payroll" | "commission", month: string, profileId: string, via: "drawer" | "bank"): Promise<Res> {
  const s = await requireStaff();
  if (!s.perms.has("staff.payroll_edit")) return { ok: false, error: "forbidden" };
  if (!MONTH.test(month) || !UUID.test(profileId)) return { ok: false, error: "bad_request" };
  let shiftId: string | null = null;
  if (via === "drawer") {
    const { data: sh } = await db().from("pos_shifts").select("id").eq("opened_by", s.id).eq("status", "open").limit(1).maybeSingle();
    if (!sh) return { ok: false, error: "no_shift" };
    shiftId = sh.id;
  }
  const { error } = await db().rpc("pay_sheet_line", { p: { sheet, month, profile_id: profileId, via, shift_id: shiftId, client_id: crypto.randomUUID(), user_id: s.id } });
  if (error) return { ok: false, error: sqlErr(error.message) };
  revalidatePath(`/staff/${sheet}`);
  return { ok: true };
}
