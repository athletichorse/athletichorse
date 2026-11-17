"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { isValidVatNumber, normalizeSaudiMobile, toLatinDigits } from "@/lib/saudi";
import { audit } from "@/lib/audit";

/** Business details (commercial registration + national address); empty fields are saved as empty. */
function readDetails(form: FormData) {
  const num = (k: string) => toLatinDigits(String(form.get(k) ?? "")).replace(/\s/g, "") || null;
  const txt = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max) || null;
  const d = {
    cr_number: num("cr_number"), addr_building: num("addr_building"), addr_street: txt("addr_street", 120), addr_district: txt("addr_district", 120),
    addr_city: txt("addr_city", 80), addr_country: txt("addr_country", 80), addr_postal: num("addr_postal"), addr_additional: num("addr_additional"),
  };
  const err = d.cr_number && !/^\d{10}$/.test(d.cr_number) ? "cr"
    : d.addr_building && !/^\d{4}$/.test(d.addr_building) ? "building"
    : d.addr_postal && !/^\d{5}$/.test(d.addr_postal) ? "postal"
    : d.addr_additional && !/^\d{4}$/.test(d.addr_additional) ? "additional" : null;
  return { d, err };
}

function read(form: FormData) {
  const vat = toLatinDigits(String(form.get("vat_number") ?? "")).replace(/\s/g, "");
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
  const det = readDetails(form);
  if (det.err) return back(det.err);
  const row = { phone: c.phone, name: c.name, email: c.email, vat_number: c.vat_number, notes: c.notes, credit_limit: c.credit_limit || null, discount_pct: c.discount_pct };
  let cid = id;
  if (id) {
    const { error } = await db().from("customers").update({ ...row, active: form.get("active") === "on" }).eq("id", id);
    if (error) return back(friendly(error.message));
    await audit(staff.id, "customer.update", "customer", id, { phone: c.phone, cr_number: det.d.cr_number });
  } else {
    const { data, error } = await db().from("customers").insert({ ...row, created_by: staff.id }).select("id, customer_no").single();
    if (error || !data) return back(friendly(error?.message ?? "error"));
    cid = data.id;
    await audit(staff.id, "customer.create", "customer", data.id, { customer_no: data.customer_no });
  }
  // the country alone (pre-filled on new customers) is not worth a row
  const anyDetail = Object.entries(det.d).some(([k, v]) => v && k !== "addr_country");
  if (cid && (anyDetail || id)) {
    const { error } = await db().from("customer_details").upsert({ customer_id: cid, ...det.d, updated_at: new Date().toISOString() });
    if (error) return back(error.message);
  }
  revalidatePath("/customers");
  back(undefined, c.phone.slice(4));
}
