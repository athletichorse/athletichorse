"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

const back = (q: string) => redirect(`/pos/expense-types?${q}`);
const read = (form: FormData) => ({
  name_en: String(form.get("name_en") ?? "").trim().slice(0, 60),
  name_ar: String(form.get("name_ar") ?? "").trim().slice(0, 60),
  sort: Math.max(0, Math.min(999, Math.floor(Number(form.get("sort")) || 0))),
});
const friendly = (m: string) => (/duplicate key/i.test(m) ? "duplicate" : m);

/** New expense type (e.g. Electricity). */
export async function createExpenseTypeAction(form: FormData) {
  const staff = await assertPermission("settings.edit");
  const n = read(form);
  if (!n.name_en && !n.name_ar) return back("err=name");
  const { data, error } = await db().from("expense_types").insert({ name_en: n.name_en || n.name_ar, name_ar: n.name_ar, sort: n.sort }).select("id").single();
  if (error || !data) return back(`err=${encodeURIComponent(friendly(error?.message ?? "error"))}`);
  await audit(staff.id, "expense_type.create", "expense_type", data.id, { name: n.name_en || n.name_ar });
  revalidatePath("/pos/expense-types");
  back("ok=1");
}

/** Rename, reorder, turn a type on or off (old expenses keep their type). */
export async function saveExpenseTypeAction(form: FormData) {
  const staff = await assertPermission("settings.edit");
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return back("err=bad_request");
  const n = read(form);
  if (!n.name_en && !n.name_ar) return back("err=name");
  const { error } = await db().from("expense_types").update({ name_en: n.name_en || n.name_ar, name_ar: n.name_ar, sort: n.sort, active: form.get("active") === "on" }).eq("id", id);
  if (error) return back(`err=${encodeURIComponent(friendly(error.message))}`);
  await audit(staff.id, "expense_type.update", "expense_type", id, { name: n.name_en || n.name_ar, active: form.get("active") === "on" });
  revalidatePath("/pos/expense-types");
  back("ok=1");
}
