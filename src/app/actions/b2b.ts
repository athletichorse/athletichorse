"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canUseLocation, requireStaff } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { normalizeSaudiMobile } from "@/lib/saudi";
import { B2B_METHODS, B2B_STATUSES, errCode, latin, num, type B2bStatus } from "@/lib/purchasing";

type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const isId = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const day = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
const txt = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const B2B_ERRORS = ["no_lines", "bad_customer", "bad_qty", "bad_price", "bad_discount", "bad_item", "locked", "already_delivered", "deliver_first", "has_payments", "not_found", "bad_status"] as const;

async function b2bStaff() {
  const s = await requireStaff();
  return s.perms.has("sales.b2b") ? s : null;
}

export type B2bCustomer = { id: string; customerNo: number; name: string; phone: string; levelId: string | null; levelName: string | null };

/** Find a business customer by mobile, customer no. or name. */
export async function b2bCustomersAction(term: string, locale: "ar" | "en" = "en"): Promise<B2bCustomer[]> {
  const s = await b2bStaff();
  if (!s) return [];
  const t = String(term ?? "").trim().slice(0, 60);
  if (!t) return [];
  const cols = "id, customer_no, name, phone";
  const phone = normalizeSaudiMobile(t);
  let rows: { id: string; customer_no: number; name: string; phone: string }[] = [];
  if (phone) rows = (await db().from("customers").select(cols).eq("phone", phone).limit(1)).data ?? [];
  else if (/^\d{1,9}$/.test(latin(t))) rows = (await db().from("customers").select(cols).eq("customer_no", Number(latin(t))).limit(1)).data ?? [];
  if (!rows.length) rows = (await db().from("customers").select(cols).eq("active", true).ilike("name", `%${t.replace(/[%_\\]/g, "")}%`).order("name").limit(10)).data ?? [];
  const ids = rows.map((r) => r.id);
  const { data: det } = ids.length ? await db().from("customer_details").select("customer_id, price_level_id").in("customer_id", ids) : { data: [] };
  const lvIds = [...new Set((det ?? []).map((d) => d.price_level_id).filter(Boolean))] as string[];
  const { data: lvs } = lvIds.length ? await db().from("price_levels").select("id, name_en, name_ar").in("id", lvIds) : { data: [] };
  return rows.map((r) => {
    const lv = (det ?? []).find((d) => d.customer_id === r.id)?.price_level_id ?? null;
    const l = (lvs ?? []).find((x) => x.id === lv);
    return { id: r.id, customerNo: r.customer_no, name: r.name, phone: r.phone, levelId: l ? l.id : null, levelName: l ? (locale === "ar" && l.name_ar) || l.name_en : null };
  });
}

/** The customer's level price for these items (items without one keep the normal price). */
export async function b2bLevelPricesAction(levelId: string, variantIds: string[]): Promise<Record<string, string>> {
  const s = await b2bStaff();
  if (!s || !isId(levelId)) return {};
  const ids = (variantIds ?? []).filter(isId).slice(0, 500);
  if (!ids.length) return {};
  const { data: lv } = await db().from("price_levels").select("id, code, active").eq("id", levelId).maybeSingle();
  if (!lv?.active) return {};
  if (lv.code === "wholesale") {
    const { data } = await db().from("product_variants").select("id, wholesale_price").in("id", ids);
    return Object.fromEntries((data ?? []).filter((v) => v.wholesale_price !== null).map((v) => [v.id, Number(v.wholesale_price).toFixed(2)]));
  }
  const { data } = await db().from("variant_level_prices").select("variant_id, price").eq("level_id", levelId).in("variant_id", ids);
  return Object.fromEntries((data ?? []).map((v) => [v.variant_id, Number(v.price).toFixed(2)]));
}

export type B2bInput = {
  id?: string; clientId: string; customerId: string; locationId: string; dueOn: string; customerRef: string; notes: string;
  lines: { variantId: string; qty: string; price: string; discount: string }[];
};

export async function saveB2bOrderAction(input: B2bInput): Promise<R<{ id: string; orderNo: number }>> {
  const s = await b2bStaff();
  if (!s) return { ok: false, error: "forbidden" };
  if (!isId(input.clientId) || (input.id && !isId(input.id))) return { ok: false, error: "bad_status" };
  if (!isId(input.customerId)) return { ok: false, error: "bad_customer" };
  if (!isId(input.locationId)) return { ok: false, error: "bad_store" };
  if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 500) return { ok: false, error: "no_lines" };
  const lines = [];
  for (const l of input.lines) {
    const qty = num(l.qty, 3), price = num(l.price, 2, true), disc = latin(l.discount) ? num(l.discount, 2, true) : "0";
    if (!isId(l.variantId) || !qty) return { ok: false, error: "bad_qty" };
    if (price === null) return { ok: false, error: "bad_price" };
    if (disc === null || Number(disc) > 100) return { ok: false, error: "bad_discount" };
    lines.push({ variant_id: l.variantId, qty, unit_price: price, discount_pct: disc });
  }
  const { data, error } = await db().rpc("save_b2b_order", {
    p: {
      id: input.id ?? null, client_id: input.clientId, customer_id: input.customerId, location_id: input.locationId,
      due_on: day(input.dueOn), customer_ref: txt(input.customerRef, 60), notes: String(input.notes ?? "").slice(0, 1000), user_id: s.id, lines,
    },
  });
  if (error || !data) return { ok: false, error: errCode(error?.message, B2B_ERRORS) };
  const r = data as { id: string; order_no: number; duplicate: boolean };
  if (!r.duplicate) await audit(s.id, input.id ? "b2b.update" : "b2b.create", "b2b_order", r.id, { order_no: r.order_no });
  revalidatePath("/sales/b2b");
  return { ok: true, id: r.id, orderNo: r.order_no };
}

export async function setB2bStatusAction(orderId: string, status: B2bStatus, invoiceRef = ""): Promise<R> {
  const s = await b2bStaff();
  if (!s) return { ok: false, error: "forbidden" };
  if (!isId(orderId) || !(B2B_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "bad_status" };
  const { data: o } = await db().from("b2b_orders").select("id, order_no, location_id").eq("id", orderId).maybeSingle();
  if (!o) return { ok: false, error: "not_found" };
  if (status === "delivered" && !canUseLocation(s, o.location_id)) return { ok: false, error: "forbidden" };
  const { data, error } = await db().rpc("set_b2b_status", { p_order: o.id, p_status: status, p_user: s.id, p_invoice_ref: txt(invoiceRef, 60) || null });
  if (error) return { ok: false, error: errCode(error.message, B2B_ERRORS) };
  if (!(data as { unchanged?: boolean })?.unchanged) await audit(s.id, `b2b.${status}`, "b2b_order", o.id, { order_no: o.order_no });
  revalidatePath(`/sales/b2b/${o.id}`);
  revalidatePath("/sales/b2b");
  return { ok: true };
}

export async function addB2bPaymentAction(form: FormData) {
  const s = await b2bStaff();
  if (!s) redirect("/forbidden");
  const id = String(form.get("order_id") ?? "");
  if (!isId(id)) redirect("/sales/b2b");
  const back = (err?: string) => redirect(`/sales/b2b/${id}?${err ? `err=${encodeURIComponent(err)}` : "ok=1"}`);
  const amount = num(form.get("amount"), 2);
  if (!amount) return back("bad_amount");
  const method = String(form.get("method") ?? "bank");
  if (!(B2B_METHODS as readonly string[]).includes(method)) return back("bad_status");
  const { data: o } = await db().from("b2b_list").select("id, customer_id, status, due, order_no").eq("id", id).maybeSingle();
  if (!o) return back("not_found");
  if (o.status === "cancelled") return back("locked");
  if (Number(amount) > Number(o.due) + 0.001) return back("too_much");
  const clientId = isId(form.get("client_id")) ? String(form.get("client_id")) : crypto.randomUUID();
  const { error } = await db().from("b2b_payments").insert({
    client_id: clientId, order_id: id, customer_id: o.customer_id, amount, method,
    paid_on: day(form.get("paid_on")) ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }),
    ref: txt(form.get("ref"), 60) || null, created_by: s.id,
  });
  if (error && !/duplicate key/i.test(error.message)) return back(errCode(error.message, []));
  if (!error) await audit(s.id, "b2b.payment", "b2b_order", id, { order_no: o.order_no, amount });
  revalidatePath(`/sales/b2b/${id}`);
  back();
}
