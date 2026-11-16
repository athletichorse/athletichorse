"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { ROLES } from "@/lib/permissions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Working hours for a group or a person (owner is never limited). */
export async function saveHoursAction(form: FormData) {
  const s = await assertPermission("permissions.edit");
  const back = (e?: string) => redirect(`/audit/hours${e ? `?err=${e}` : "?ok=1"}`);
  const who = String(form.get("who") ?? "");
  const role = who.startsWith("role:") ? who.slice(5) : null;
  const person = who.startsWith("person:") ? who.slice(7) : null;
  if ((role && (!(ROLES as readonly string[]).includes(role) || role === "owner")) || (person && !UUID.test(person)) || (!role && !person)) return back("bad_value");
  const days = form.getAll("days").map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const start = String(form.get("start") ?? ""), end = String(form.get("end") ?? "");
  if (!days.length || !TIME.test(start) || !TIME.test(end)) return back("bad_value");
  const row = { days, start_time: start, end_time: end, active: form.get("active") === "on", updated_at: new Date().toISOString() };
  const q = role ? db().from("work_hours").select("id").eq("role", role) : db().from("work_hours").select("id").eq("profile_id", person!);
  const { data: existing } = await q.maybeSingle();
  const { error } = existing
    ? await db().from("work_hours").update(row).eq("id", existing.id)
    : await db().from("work_hours").insert({ ...row, role, profile_id: person });
  if (error) return back("bad_value");
  await audit(s.id, "security.hours", "work_hours", role ?? person, { days, start, end, active: row.active });
  revalidatePath("/audit/hours");
  back();
}

/** Device lock on/off for a person. */
export async function setDeviceLockAction(form: FormData) {
  const s = await assertPermission("permissions.edit");
  const id = String(form.get("profile_id") ?? "");
  if (!UUID.test(id)) return;
  const on = form.get("on") === "1";
  await db().from("profiles").update({ device_lock: on }).eq("id", id).neq("role", "owner");
  await audit(s.id, "security.device_lock", "profile", id, { on });
  revalidatePath("/audit/devices");
}

/** Approve or block one device. */
export async function setDeviceApprovedAction(form: FormData) {
  const s = await assertPermission("permissions.edit");
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return;
  const ok = form.get("approved") === "1";
  await db().from("devices").update({ approved: ok, approved_by: ok ? s.id : null, label: String(form.get("label") ?? "").slice(0, 60) }).eq("id", id);
  await audit(s.id, ok ? "security.device_approve" : "security.device_block", "device", id, {});
  revalidatePath("/audit/devices");
}
