"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canUseLocation, requireStaff } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { SUPPLIER_METHODS, errCode, isCurrency, latin, num } from "@/lib/purchasing";

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const isId = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const day = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
const txt = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const PO_ERRORS = ["no_lines", "bad_supplier", "bad_rate", "bad_qty", "bad_cost", "bad_item", "locked", "too_many", "not_found", "bad_status"] as const;

async function staffWith(key: "purchasing.edit" | "purchasing.receive" | "purchasing.pay") {
  const s = await requireStaff();
  return s.perms.has(key) && s.perms.has("purchasing.view") ? s : null;
}

// ---------------------------------------------------------------- suppliers
export async function saveSupplierAction(form: FormData) {
  const s = await staffWith("purchasing.edit");
  if (!s) redirect("/forbidden");
  const id = isId(form.get("id")) ? String(form.get("id")) : null;
  const back = (err?: string, sid?: string) =>
    redirect(sid || id ? `/purchasing/suppliers/${sid ?? id}?${err ? `err=${encodeURIComponent(err)}` : "ok=1"}` : `/purchasing/suppliers?err=${encodeURIComponent(err ?? "")}`);
  const name = txt(form.get("name"), 120);
  if (!name) return back("name");
  const currency = txt(form.get("currency"), 3).toUpperCase() || "SAR";
  if (!isCurrency(currency)) return back("bad_currency");
  const row = {
    name, currency,
    factory: txt(form.get("factory"), 120) || null,
    phone: txt(form.get("phone"), 30) || null,
    email: txt(form.get("email"), 120) || null,
    country: txt(form.get("country"), 60) || null,
    vat_no: txt(form.get("vat_no"), 30) || null,
    cr_no: txt(form.get("cr_no"), 30) || null,
    address: txt(form.get("address"), 300) || null,
    notes: String(form.get("notes") ?? "").trim().slice(0, 1000),
    updated_at: new Date().toISOString(),
  };
  if (id) {
    const { error } = await db().from("suppliers").update({ ...row, active: form.get("active") === "on" }).eq("id", id);
    if (error) return back(errCode(error.message, []));
    await audit(s.id, "supplier.update", "supplier", id, { name });
    revalidatePath("/purchasing/suppliers");
    return back();
  }
  const { data, error } = await db().from("suppliers").insert({ ...row, created_by: s.id }).select("id").single();
  if (error || !data) return back(errCode(error?.message, []));
  await audit(s.id, "supplier.create", "supplier", data.id, { name });
  revalidatePath("/purchasing/suppliers");
  back(undefined, data.id);
}

export async function addSupplierPaymentAction(form: FormData) {
  const s = await staffWith("purchasing.pay");
  if (!s) redirect("/forbidden");
  const sid = String(form.get("supplier_id") ?? "");
  if (!isId(sid)) redirect("/purchasing/suppliers");
  const back = (err?: string) => redirect(`/purchasing/suppliers/${sid}?${err ? `err=${encodeURIComponent(err)}` : "ok=1"}`);
  const currency = txt(form.get("currency"), 3).toUpperCase();
  if (!isCurrency(currency)) return back("bad_currency");
  const amount = num(form.get("amount"), 2);
  if (!amount) return back("bad_amount");
  const rate = currency === "SAR" ? "1" : num(form.get("rate"), 6);
  if (!rate) return back("bad_rate");
  const method = String(form.get("method") ?? "bank");
  if (!(SUPPLIER_METHODS as readonly string[]).includes(method)) return back("bad_status");
  const clientId = isId(form.get("client_id")) ? String(form.get("client_id")) : crypto.randomUUID();
  const { error } = await db().from("supplier_payments").insert({
    client_id: clientId, supplier_id: sid, paid_on: day(form.get("paid_on")) ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }),
    currency, rate, amount, amount_sar: (Math.round(Number(amount) * Number(rate) * 100) / 100).toFixed(2), method,
    ref: txt(form.get("ref"), 60) || null, note: String(form.get("note") ?? "").trim().slice(0, 500), created_by: s.id,
  });
  // the same form sent twice (double tap) is saved once
  if (error && !/duplicate key/i.test(error.message)) return back(errCode(error.message, []));
  if (!error) await audit(s.id, "supplier.payment", "supplier", sid, { amount, currency });
  revalidatePath(`/purchasing/suppliers/${sid}`);
  back();
}

// ---------------------------------------------------------------- purchase orders
export type PoInput = {
  id?: string; clientId: string; supplierId: string; locationId: string; currency: string; rate: string;
  expectedOn: string; supplierRef: string; notes: string; status: "draft" | "ordered";
  lines: { variantId: string; qty: string; unitCost: string }[];
};

export async function savePurchaseOrderAction(input: PoInput): Promise<R<{ id: string; poNo: number }>> {
  const s = await staffWith("purchasing.edit");
  if (!s) return { ok: false, error: "forbidden" };
  if (!isId(input.clientId) || (input.id && !isId(input.id))) return { ok: false, error: "bad_status" };
  if (!isId(input.supplierId)) return { ok: false, error: "bad_supplier" };
  if (!isId(input.locationId)) return { ok: false, error: "bad_store" };
  const currency = String(input.currency ?? "").toUpperCase();
  if (!isCurrency(currency)) return { ok: false, error: "bad_currency" };
  const rate = currency === "SAR" ? "1" : num(input.rate, 6);
  if (!rate) return { ok: false, error: "bad_rate" };
  if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 500) return { ok: false, error: "no_lines" };
  const lines = [];
  for (const l of input.lines) {
    const qty = num(l.qty, 3), cost = num(l.unitCost, 4, true);
    if (!isId(l.variantId) || !qty) return { ok: false, error: "bad_qty" };
    if (cost === null) return { ok: false, error: "bad_cost" };
    lines.push({ variant_id: l.variantId, qty, unit_cost: cost });
  }
  const { data, error } = await db().rpc("save_purchase_order", {
    p: {
      id: input.id ?? null, client_id: input.clientId, supplier_id: input.supplierId, location_id: input.locationId, currency, rate,
      expected_on: day(input.expectedOn), supplier_ref: txt(input.supplierRef, 60), notes: String(input.notes ?? "").slice(0, 1000),
      status: input.status === "ordered" ? "ordered" : "draft", user_id: s.id, lines,
    },
  });
  if (error || !data) return { ok: false, error: errCode(error?.message, PO_ERRORS) };
  const r = data as { id: string; po_no: number; duplicate: boolean };
  if (!r.duplicate) await audit(s.id, input.id ? "purchase.update" : "purchase.create", "purchase_order", r.id, { po_no: r.po_no, status: input.status });
  revalidatePath("/purchasing");
  return { ok: true, id: r.id, poNo: r.po_no };
}

/** Mark ordered, or cancel (only while nothing has been received). */
export async function setPurchaseStatusAction(form: FormData) {
  const s = await staffWith("purchasing.edit");
  if (!s) redirect("/forbidden");
  const id = String(form.get("id") ?? "");
  const to = String(form.get("status") ?? "");
  if (!isId(id) || !["ordered", "cancelled"].includes(to)) redirect("/purchasing");
  const back = (err?: string) => redirect(`/purchasing/${id}?${err ? `err=${encodeURIComponent(err)}` : "ok=1"}`);
  const { count } = await db().from("purchase_receipts").select("id", { count: "exact", head: true }).eq("order_id", id);
  if (to === "cancelled" && (count ?? 0) > 0) return back("locked");
  const from = to === "ordered" ? ["draft"] : ["draft", "ordered"];
  const { data, error } = await db().from("purchase_orders").update({ status: to, updated_at: new Date().toISOString() }).eq("id", id).in("status", from).select("po_no");
  if (error) return back(error.message);
  if (!data?.length) return back("locked");
  await audit(s.id, `purchase.${to}`, "purchase_order", id, { po_no: data[0].po_no });
  revalidatePath("/purchasing");
  back();
}

export type ReceiveInput = { clientId: string; orderId: string; billNo: string; receivedOn: string; lines: { lineNo: number; qty: string }[] };

export async function receivePurchaseAction(input: ReceiveInput): Promise<R<{ docNo: string }>> {
  const s = await staffWith("purchasing.receive");
  if (!s) return { ok: false, error: "forbidden" };
  if (!isId(input.clientId) || !isId(input.orderId)) return { ok: false, error: "not_found" };
  const { data: o } = await db().from("purchase_orders").select("id, po_no, location_id").eq("id", input.orderId).maybeSingle();
  if (!o) return { ok: false, error: "not_found" };
  if (!canUseLocation(s, o.location_id)) return { ok: false, error: "forbidden" };
  const lines = [];
  for (const l of input.lines ?? []) {
    const q = latin(l.qty);
    if (!q || Number(q) === 0) continue;
    const qty = num(q, 3);
    if (!qty || !Number.isInteger(l.lineNo)) return { ok: false, error: "bad_qty" };
    lines.push({ line_no: l.lineNo, qty });
  }
  if (!lines.length) return { ok: false, error: "no_lines" };
  const { data, error } = await db().rpc("receive_purchase", {
    p: { client_id: input.clientId, order_id: o.id, bill_no: txt(input.billNo, 60), received_on: day(input.receivedOn), user_id: s.id, lines },
  });
  if (error || !data) return { ok: false, error: errCode(error?.message, PO_ERRORS) };
  const r = data as { doc_no?: string; amount?: number; duplicate: boolean };
  if (!r.duplicate) await audit(s.id, "purchase.receive", "purchase_order", o.id, { po_no: o.po_no, lines: lines.length, amount: r.amount });
  revalidatePath(`/purchasing/${o.id}`);
  revalidatePath("/purchasing");
  return { ok: true, docNo: String(r.doc_no ?? "") };
}
