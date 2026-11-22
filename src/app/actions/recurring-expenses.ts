"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { num } from "@/lib/purchasing";
import { EXPENSE_METHODS, FREQUENCIES } from "@/lib/recurring";

const isId = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const day = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
const txt = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const back = (err?: string) => redirect(`/purchasing/expenses?${err ? `err=${encodeURIComponent(err)}` : "ok=1"}`);

async function staff() {
  const s = await requireStaff();
  if (!s.perms.has("purchasing.expenses")) redirect("/forbidden?k=purchasing.expenses");
  return s;
}

/** Add or change a recurring expense. */
export async function saveRecurringAction(form: FormData) {
  const s = await staff();
  const id = isId(form.get("id")) ? String(form.get("id")) : null;
  const name = txt(form.get("name"), 120);
  if (!name) return back("name");
  const amount = num(form.get("amount"), 2);
  if (!amount) return back("amount");
  const dueDay = Number(form.get("due_day"));
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) return back("day");
  const start = day(form.get("start_on"));
  if (!start) return back("start");
  const end = day(form.get("end_on"));
  if (end && end < start) return back("end");
  const frequency = String(form.get("frequency") ?? "monthly");
  const method = String(form.get("method") ?? "bank");
  if (!(FREQUENCIES as readonly string[]).includes(frequency) || !(EXPENSE_METHODS as readonly string[]).includes(method)) return back("bad");
  const typeId = isId(form.get("expense_type_id")) ? String(form.get("expense_type_id")) : null;
  const locId = isId(form.get("location_id")) ? String(form.get("location_id")) : null;
  const row = {
    name, amount, frequency, method, due_day: dueDay, start_on: start, end_on: end, expense_type_id: typeId, location_id: locId,
    payee: txt(form.get("payee"), 120) || null, notes: String(form.get("notes") ?? "").trim().slice(0, 1000), updated_at: new Date().toISOString(),
  };
  if (id) {
    const { error } = await db().from("recurring_expenses").update({ ...row, active: form.get("active") === "on" }).eq("id", id);
    if (error) return back(error.message);
    await audit(s.id, "expense.recurring_update", "recurring_expense", id, { name, amount });
  } else {
    const { data, error } = await db().from("recurring_expenses").insert({ ...row, created_by: s.id }).select("id").single();
    if (error || !data) return back(error?.message ?? "bad");
    await audit(s.id, "expense.recurring_create", "recurring_expense", data.id, { name, amount });
  }
  revalidatePath("/purchasing/expenses");
  back();
}

/** Pay one period of a recurring expense (once per period). */
export async function payRecurringAction(form: FormData) {
  const s = await staff();
  const rid = String(form.get("recurring_id") ?? "");
  const period = String(form.get("period") ?? "");
  if (!isId(rid) || !/^\d{4}-\d{2}-01$/.test(period)) return back("bad");
  const amount = num(form.get("amount"), 2);
  if (!amount) return back("amount");
  const method = String(form.get("method") ?? "bank");
  if (!(EXPENSE_METHODS as readonly string[]).includes(method)) return back("bad");
  const { data: r } = await db().from("recurring_expenses").select("id, name, location_id, expense_type_id").eq("id", rid).maybeSingle();
  if (!r) return back("bad");
  const { error } = await db().from("expense_payments").insert({
    client_id: isId(form.get("client_id")) ? String(form.get("client_id")) : crypto.randomUUID(),
    recurring_id: rid, period, amount, method, paid_on: day(form.get("paid_on")) ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }),
    ref: txt(form.get("ref"), 60) || null, location_id: r.location_id, expense_type_id: r.expense_type_id, created_by: s.id,
  });
  if (error) return back(/duplicate key/i.test(error.message) ? "duplicate" : error.message);
  await audit(s.id, "expense.paid", "recurring_expense", rid, { name: r.name, period, amount });
  revalidatePath("/purchasing/expenses");
  revalidatePath("/");
  back();
}
