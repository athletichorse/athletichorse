"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { isValidVatNumber, normalizeSaudiMobile } from "@/lib/saudi";
import { audit } from "@/lib/audit";

function read(form: FormData) {
  const vat = String(form.get("vat_number") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  return {
    phone: normalizeSaudiMobile(String(form.get("phone") ?? "")),
    name: String(form.get("name") ?? "").trim().slice(0, 200),
    email: email || null,
    vat_number: vat || null,
    notes: String(form.get("notes") ?? "").trim().slice(0, 1000),
    credit_limit: String(form.get("credit_limit") ?? "").trim(),
    discount_pct: String(form.get("discount_pct") ?? "0").trim() || "0",
    vatOk: !vat || isValidVatNumber(vat),
    emailOk: !email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email),
  };
}

const friendly = (m: string) => (/duplicate key/i.test(m) ? "duplicate_phone" : m);

/** New customer: "customers.edit" (add). Changing an existing one: "customers.update" (given per person). */
export async function saveCustomerAction(form: FormData) {
  const rawId = String(form.get("id") ?? "");
  const id = /^[0-9a-f-]{36}$/i.test(rawId) ? rawId : null;
  const staff = await assertPermission(id ? "customers.update" : "customers.edit");
  // editing from the customer's own page goes back there
  const back = (err?: string, cid?: string) =>
    id
      ? redirect(`/customers/${id}?${err ? `err=${encodeURIComponent(err)}` : "ok=1"}`)
      : redirect(err ? `/customers?err=${encodeURIComponent(err)}` : `/customers?ok=1${cid ? `&q=${cid}` : ""}`);
  const c = read(form);
  if (!c.phone) return back("phone");
  if (!c.vatOk) return back("vat");
  if (!c.emailOk) return back("email");
  if (c.credit_limit && !/^\d{1,9}(\.\d{1,2})?$/.test(c.credit_limit)) return back("credit_limit");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(c.discount_pct) || Number(c.discount_pct) > 100) return back("discount_pct");
  const row = { phone: c.phone, name: c.name, email: c.email, vat_number: c.vat_number, notes: c.notes, credit_limit: c.credit_limit || null, discount_pct: c.discount_pct };
  if (id) {
    const { error } = await db().from("customers").update({ ...row, active: form.get("active") === "on" }).eq("id", id);
    if (error) return back(friendly(error.message));
    await audit(staff.id, "customer.update", "customer", id, { phone: c.phone });
  } else {
    const { data, error } = await db().from("customers").insert({ ...row, created_by: staff.id }).select("id, customer_no").single();
    if (error || !data) return back(friendly(error?.message ?? "error"));
    await audit(staff.id, "customer.create", "customer", data.id, { customer_no: data.customer_no });
  }
  revalidatePath("/customers");
  back(undefined, c.phone.slice(4));
}
