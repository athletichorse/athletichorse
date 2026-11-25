"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canUseLocation, requireStaff } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { SUPPLIER_METHODS, errCode, isCurrency, latin, num } from "@/lib/purchasing";
import { FX_CURRENCIES, expectedSar, readRates } from "@/lib/fx";

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

export type PackInfo = { units_per_carton: number | null; carton_cbm: number | null; china_price: number | null; china_currency: string; bin: string | null; expected_sar: number | null };
/** Carton, CBM and China price of the items on a purchase order. */
export async function poItemInfoAction(variantIds: string[]): Promise<Record<string, PackInfo>> {
  const s = await staffWith("purchasing.edit");
  if (!s) return {};
  const ids = (variantIds ?? []).filter(isId).slice(0, 500);
  if (!ids.length) return {};
  const { data: vs } = await db().from("product_variants").select("id, product_id").in("id", ids);
  const pids = [...new Set((vs ?? []).map((v) => v.product_id))];
  const { data: ps } = pids.length ? await db().from("products").select("id, units_per_carton, carton_cbm, china_price, china_currency, bin_location").in("id", pids) : { data: [] };
  const { data: fx } = await db().from("settings").select("value").eq("key", "fx_rates").maybeSingle();
  const rates = readRates(fx?.value);
  const out: Record<string, PackInfo> = {};
  for (const v of vs ?? []) {
    const p = ps?.find((x) => x.id === v.product_id);
    if (p) out[v.id] = { units_per_carton: p.units_per_carton, carton_cbm: p.carton_cbm === null ? null : Number(p.carton_cbm), china_price: p.china_price === null ? null : Number(p.china_price), china_currency: p.china_currency ?? "CNY", bin: p.bin_location, expected_sar: expectedSar(p.china_price, p.china_currency, rates) };
  }
  return out;
}

/** Exchange rates to SAR used for the expected purchase price (China price × rate). */
export async function saveRatesAction(form: FormData) {
  const s = await staffWith("purchasing.edit");
  if (!s) redirect("/forbidden");
  const rates: Record<string, number> = {};
  for (const c of FX_CURRENCIES) {
    const v = latin(form.get(`fx:${c}`));
    if (!v) continue;
    if (!/^\d{1,6}(\.\d{1,6})?$/.test(v) || Number(v) <= 0) redirect(`/purchasing?err=bad_rate`);
    rates[c] = Number(v);
  }
  await db().from("settings").upsert({ key: "fx_rates", value: rates });
  await audit(s.id, "purchasing.fx_rates", "settings", null, rates);
  revalidatePath("/purchasing");
  redirect("/purchasing?ok=fx");
}

// ---------------------------------------------------------------- China (container) orders
export type CnInput = {
  id?: string; clientId: string; supplierId: string; locationId: string; title: string; container: string; status: "draft" | "ordered" | "shipped";
  rate: string; ratePaid: string; feeShipping: string; feeCustoms: string; feeOther: string; notes: string;
  lines: { supplier_code: string; description: string; variant_id: string | null; cartons: string; per_carton: string; unit_price: string; carton_cbm: string; image_url?: string | null }[];
};

export async function saveChinaOrderAction(input: CnInput): Promise<R<{ id: string; poNo: number; linked: number }>> {
  const s = await staffWith("purchasing.edit");
  if (!s) return { ok: false, error: "forbidden" };
  if (!isId(input.clientId) || (input.id && !isId(input.id))) return { ok: false, error: "bad_status" };
  if (!isId(input.locationId)) return { ok: false, error: "bad_store" };
  if (input.supplierId && !isId(input.supplierId)) return { ok: false, error: "bad_supplier" };
  if (!["draft", "ordered", "shipped"].includes(input.status)) return { ok: false, error: "bad_status" };
  if (!["", "20ft", "40ft", "40hc"].includes(input.container ?? "")) return { ok: false, error: "bad_status" };
  const rate = num(input.rate, 6);
  if (!rate) return { ok: false, error: "bad_rate" };
  const paid = latin(input.ratePaid) ? num(input.ratePaid, 6) : "";
  if (paid === null) return { ok: false, error: "bad_rate" };
  const fee = (v: string) => (latin(v) ? num(v, 2, true) : "0");
  const [ship, cust, other] = [fee(input.feeShipping), fee(input.feeCustoms), fee(input.feeOther)];
  if (ship === null || cust === null || other === null) return { ok: false, error: "bad_cost" };
  const lines = (input.lines ?? []).filter((l) => (l.supplier_code ?? "").trim() || (l.description ?? "").trim() || l.variant_id);
  if (!lines.length || lines.length > 1000) return { ok: false, error: "no_lines" };
  const clean = [];
  for (const l of lines) {
    const cartons = latin(l.cartons) ? num(l.cartons, 2, true) : "0", per = latin(l.per_carton) ? num(l.per_carton, 0) : "1";
    const price = latin(l.unit_price) ? num(l.unit_price, 4, true) : "0", cbm = latin(l.carton_cbm) ? num(l.carton_cbm, 4, true) : "0";
    if (cartons === null || per === null || Number(per) > 100000) return { ok: false, error: "bad_qty" };
    if (price === null || cbm === null) return { ok: false, error: "bad_cost" };
    if (l.variant_id && !isId(l.variant_id)) return { ok: false, error: "bad_item" };
    const img = typeof l.image_url === "string" && /^https:\/\//.test(l.image_url) ? l.image_url.slice(0, 500) : null;
    clean.push({ supplier_code: txt(l.supplier_code, 60), description: String(l.description ?? "").trim().slice(0, 300), variant_id: l.variant_id || null, cartons, per_carton: per, unit_price: price, carton_cbm: cbm, image_url: img });
  }
  const { data, error } = await db().rpc("save_china_order", {
    p: { id: input.id ?? null, client_id: input.clientId, supplier_id: input.supplierId || null, location_id: input.locationId, title: txt(input.title, 120),
         container: input.container || null, status: input.status, rate, rate_paid: paid || null, fee_shipping: ship, fee_customs: cust, fee_other: other,
         notes: String(input.notes ?? "").slice(0, 1000), user_id: s.id, lines: clean },
  });
  if (error || !data) return { ok: false, error: errCode(error?.message, PO_ERRORS) };
  const r = data as { id: string; po_no: number; duplicate: boolean; linked?: number };
  if (!r.duplicate) await audit(s.id, input.id ? "china.update" : "china.create", "purchase_order", r.id, { po_no: r.po_no, lines: clean.length });
  if (!r.duplicate) await rememberOnProducts(clean);
  revalidatePath("/purchasing/china");
  revalidatePath("/purchasing");
  return { ok: true, id: r.id, poNo: r.po_no, linked: r.linked ?? 0 };
}

export type CodeMatch = { variant_id: string; sku: string | null; name: string; image_url: string | null; per_carton: number | null; carton_cbm: number | null; china_price: number | null; china_currency: string | null };
/** Supplier codes that are also a portal item's SKU or extra code: linked by themselves. */
export async function matchCodesAction(codes: string[], locale: "ar" | "en" = "en"): Promise<Record<string, CodeMatch>> {
  const s = await staffWith("purchasing.edit");
  if (!s) return {};
  const list = [...new Set((codes ?? []).map((c) => String(c ?? "").trim()).filter((c) => c && c.length <= 60))].slice(0, 1000);
  if (!list.length) return {};
  const byCode = new Map<string, string>();
  for (let i = 0; i < list.length; i += 200) {
    const part = list.slice(i, i + 200);
    const [{ data: vs }, { data: pc }] = await Promise.all([
      db().from("product_variants").select("id, sku").in("sku", part),
      db().from("product_codes").select("variant_id, code").in("code", part),
    ]);
    for (const v of vs ?? []) if (v.sku) byCode.set(v.sku, v.id);
    for (const c of pc ?? []) if (!byCode.has(c.code)) byCode.set(c.code, c.variant_id);
  }
  const ids = [...new Set(byCode.values())];
  if (!ids.length) return {};
  const { data: info } = await db().from("variant_search").select("variant_id, product_id, sku, name_en, name_ar, option1, option2, image_url").in("variant_id", ids);
  const pids = [...new Set((info ?? []).map((x) => x.product_id))];
  const { data: ps } = pids.length ? await db().from("products").select("id, units_per_carton, carton_cbm, china_price, china_currency").in("id", pids) : { data: [] };
  const out: Record<string, CodeMatch> = {};
  for (const [code, vid] of byCode) {
    const v = info?.find((x) => x.variant_id === vid);
    if (!v) continue;
    const p = ps?.find((x) => x.id === v.product_id);
    out[code] = { variant_id: vid, sku: v.sku, name: `${(locale === "ar" && v.name_ar) || v.name_en}${[v.option1, v.option2].filter(Boolean).length ? " · " + [v.option1, v.option2].filter(Boolean).join(" / ") : ""}`,
      image_url: v.image_url, per_carton: p?.units_per_carton ?? null, carton_cbm: p?.carton_cbm === null || p?.carton_cbm === undefined ? null : Number(p.carton_cbm),
      china_price: p?.china_price === null || p?.china_price === undefined ? null : Number(p.china_price), china_currency: p?.china_currency ?? null };
  }
  return out;
}

/**
 * A China order line linked to one of our items teaches that item: its China price (CNY), carton CBM and pieces per
 * carton are saved on the product, and the supplier's code becomes an extra code of the item, so the next sheet
 * links by itself and a reorder brings these numbers back.
 */
async function rememberOnProducts(lines: { supplier_code: string; variant_id: string | null; per_carton: string; unit_price: string; carton_cbm: string }[]) {
  const linked = lines.filter((l) => l.variant_id);
  if (!linked.length) return;
  const { data: vs } = await db().from("product_variants").select("id, product_id, sku").in("id", [...new Set(linked.map((l) => l.variant_id as string))]);
  const prodOf = new Map((vs ?? []).map((v) => [v.id, v]));
  const done = new Set<string>();
  for (const l of linked) {
    const v = prodOf.get(l.variant_id as string);
    if (!v) continue;
    if (!done.has(v.product_id)) {
      done.add(v.product_id);
      const row: Record<string, unknown> = { china_currency: "CNY" };
      if (Number(l.unit_price) > 0) row.china_price = Number(l.unit_price);
      if (Number(l.carton_cbm) > 0 && Number(l.carton_cbm) < 100) row.carton_cbm = Number(l.carton_cbm);
      if (Number(l.per_carton) >= 1) row.units_per_carton = Math.round(Number(l.per_carton));
      await db().from("products").update(row).eq("id", v.product_id);
    }
    const code = l.supplier_code.trim();
    if (code && code !== v.sku && /^[\w./-]{1,60}$/u.test(code)) {
      const { data: has } = await db().from("product_codes").select("variant_id").eq("code", code).maybeSingle();
      // only when the code is free (not another item's code or SKU — the database refuses those)
      if (!has) await db().from("product_codes").insert({ code, variant_id: v.id }).then(() => undefined, () => undefined);
    }
  }
}
