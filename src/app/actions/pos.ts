"use server";

import { after } from "next/server";
import { pushStockForInvoice } from "@/lib/website-push";

import { revalidatePath } from "next/cache";
import { canUseLocation, requireStaff, type Staff } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { checkApproval } from "@/lib/approval";
import { audit } from "@/lib/audit";
import { normalizeSaudiMobile } from "@/lib/saudi";
import { formatDecimal, toHalalas, toMilliQty } from "@/lib/money";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (x: unknown): x is string => typeof x === "string" && UUID.test(x);
export type PosResult<T = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: string };

const money = (v: unknown): string | null => {
  try {
    const h = toHalalas(String(v ?? "").trim());
    return h < 0n ? null : formatDecimal(h);
  } catch {
    return null;
  }
};
const qty = (v: unknown): string | null => {
  try {
    const m = toMilliQty(String(v ?? "").trim());
    if (m <= 0n) return null;
    return `${m / 1000n}.${(m % 1000n).toString().padStart(3, "0")}`;
  } catch {
    return null;
  }
};
/** SQL numbers can arrive as JSON numbers (30 instead of "30.00"): always show 2 decimals. */
const fmt = (v: unknown) => {
  try {
    return formatDecimal(toHalalas(String(v ?? "0")));
  } catch {
    return String(v ?? "");
  }
};
const has = (s: Staff, ...k: Parameters<Staff["perms"]["has"]>[0][]) => k.some((x) => s.perms.has(x));
/** SQL errors that carry a code ("not_enough_stock: 2 available") come back as just the code. */
const sqlError = (m: string) => {
  const msg = m.replace(/^.*?ERROR:\s*/, "");
  const code = msg.match(/^(not_enough_stock|credit_limit|quote_not_found|expense_type_required|customer_required|bad_amount)\b/);
  return code ? code[1] : msg;
};

async function posLocationOk(s: Staff, locationId: string) {
  if (!isId(locationId) || !canUseLocation(s, locationId)) return false;
  const { data } = await db().from("locations").select("id").eq("id", locationId).eq("active", true).eq("uses_pos", true).maybeSingle();
  return Boolean(data);
}

// ---------------------------------------------------------------- shifts
export async function openShiftAction(input: { clientId: string; locationId: string; openingCash: string }): Promise<PosResult<{ shiftId: string }>> {
  const s = await requireStaff();
  if (!has(s, "pos.shift")) return { ok: false, error: "forbidden" };
  if (!isId(input.clientId) || !(await posLocationOk(s, input.locationId))) return { ok: false, error: "location_not_allowed" };
  const cash = money(input.openingCash || "0");
  if (cash === null) return { ok: false, error: "bad_amount" };
  const { data, error } = await db().rpc("open_shift", { p_client_id: input.clientId, p_location: input.locationId, p_user: s.id, p_opening: cash });
  if (error) return { ok: false, error: sqlError(error.message) };
  await audit(s.id, "pos.shift_open", "shift", data.shift_id, { opening_cash: cash });
  revalidatePath("/pos");
  return { ok: true, shiftId: String(data.shift_id) };
}

export async function closeShiftAction(input: { shiftId: string; counted: string; note?: string }): Promise<PosResult<{ expected: string; difference: string }>> {
  const s = await requireStaff();
  if (!has(s, "pos.shift")) return { ok: false, error: "forbidden" };
  const counted = money(input.counted);
  if (!isId(input.shiftId) || counted === null) return { ok: false, error: "bad_amount" };
  const { data: sh } = await db().from("pos_shifts").select("opened_by, location_id").eq("id", input.shiftId).maybeSingle();
  if (!sh || (sh.opened_by !== s.id && !has(s, "sales.view_all_branches"))) return { ok: false, error: "forbidden" };
  const { data, error } = await db().rpc("close_shift", { p_shift: input.shiftId, p_user: s.id, p_counted: counted, p_note: String(input.note ?? "").slice(0, 300) });
  if (error) return { ok: false, error: sqlError(error.message) };
  await audit(s.id, "pos.shift_close", "shift", input.shiftId, data);
  // No revalidate here: the till shows the cash summary first; "OK" then refreshes the page.
  return { ok: true, expected: fmt(data.expected), difference: fmt(data.difference) };
}

export type DrawerKind = "cash_out" | "cash_in" | "expense" | "customer_payment";
/** Drawer movements: cash out/in, expenses (with a type) and payments received from customers. */
export async function cashMovementAction(input: { clientId: string; shiftId: string; kind: DrawerKind; amount: string; reason: string; expenseTypeId?: string; customerId?: string; method?: string; approverUsername?: string; approverPin?: string }): Promise<PosResult> {
  const s = await requireStaff();
  const kinds: DrawerKind[] = ["cash_out", "cash_in", "expense", "customer_payment"];
  if (!kinds.includes(input.kind)) return { ok: false, error: "bad_request" };
  const allowed = input.kind === "cash_out" || input.kind === "cash_in" ? has(s, "pos.cash_out") : has(s, "pos.collect", "pos.shift");
  if (!allowed) return { ok: false, error: "forbidden" };
  const amount = money(input.amount);
  if (!isId(input.clientId) || !isId(input.shiftId) || !amount || amount === "0.00") return { ok: false, error: "bad_amount" };
  if (input.kind === "expense" && !isId(input.expenseTypeId)) return { ok: false, error: "expense_type_required" };
  if (input.kind === "customer_payment" && !isId(input.customerId)) return { ok: false, error: "customer_required" };
  const { data: shift } = await db().from("pos_shifts").select("location_id, opened_by").eq("id", input.shiftId).maybeSingle();
  if (!shift || !canUseLocation(s, shift.location_id)) return { ok: false, error: "location_not_allowed" };
  // cash out → its own PIN rule; cash in and expenses follow the till PIN rule
  const rule = input.kind === "cash_out" ? "approval.cash_out" : input.kind === "customer_payment" ? null : "approval.discount";
  let approver: string | null = null;
  if (rule) {
    const a = await checkApproval(s, rule, input.approverUsername, input.approverPin);
    if (!a.ok) return { ok: false, error: a.error };
    approver = a.approverId;
  }
  const { data, error } = await db().rpc("post_cash_movement2", {
    p: { client_id: input.clientId, shift_id: input.shiftId, kind: input.kind, amount, reason: String(input.reason ?? "").slice(0, 300), user_id: s.id,
         approved_by: approver, expense_type_id: input.kind === "expense" ? input.expenseTypeId : null,
         customer_id: input.kind === "customer_payment" ? input.customerId : null, method: input.kind === "customer_payment" ? String(input.method ?? "cash") : null },
  });
  if (error) return { ok: false, error: sqlError(error.message) };
  if (!data.duplicate) await audit(s.id, `pos.${input.kind}`, "shift", input.shiftId, { amount, approved_by: approver, customer: input.customerId ?? null });
  revalidatePath("/customers");
  return { ok: true };
}

// ---------------------------------------------------------------- pricing (server is the authority)
type CartLine = { variantId: string; qty: string; unitPrice?: string; discount?: string };
type PricedLine = { variant_id: string; qty: string; unit_price: string; discount: string };

/** Uses the database price unless the person may change prices; checks discounts. */
async function priceLines(s: Staff, lines: CartLine[], approver: { u?: string; p?: string }, customerId?: string | null): Promise<PosResult<{ lines: PricedLine[]; approvedBy: string | null }>> {
  // the customer's usual discount (%) is allowed without a PIN or the discount permission
  let usualPct = 0;
  if (customerId && isId(customerId)) {
    const { data: c } = await db().from("customers").select("discount_pct").eq("id", customerId).maybeSingle();
    usualPct = Number(c?.discount_pct ?? 0);
  }
  if (!Array.isArray(lines) || !lines.length || lines.length > 300) return { ok: false, error: "no_lines" };
  if (!lines.every((l) => isId(l.variantId))) return { ok: false, error: "bad_request" };
  const ids = [...new Set(lines.map((l) => l.variantId))];
  const { data: rows } = await db().from("variant_search").select("variant_id, price, active, product_active").in("variant_id", ids);
  const price = new Map((rows ?? []).filter((r) => r.active && r.product_active).map((r) => [r.variant_id, String(r.price)]));
  let needsDiscountApproval = false;
  const out: PricedLine[] = [];
  for (const l of lines) {
    const dbPrice = price.get(l.variantId);
    if (dbPrice === undefined) return { ok: false, error: "item_not_for_sale" };
    const q = qty(l.qty);
    if (!q) return { ok: false, error: "bad_qty" };
    let unit = formatDecimal(toHalalas(dbPrice));
    if (l.unitPrice !== undefined && l.unitPrice !== "" && money(l.unitPrice) !== unit) {
      if (!has(s, "pos.price_change")) return { ok: false, error: "no_price_change" };
      const m = money(l.unitPrice);
      if (m === null) return { ok: false, error: "bad_amount" };
      unit = m;
      needsDiscountApproval = true;
    }
    const disc = money(l.discount || "0");
    if (disc === null) return { ok: false, error: "bad_amount" };
    if (disc !== "0.00") {
      const usualMax = usualPct > 0 ? (toHalalas(unit) * toMilliQty(q) * BigInt(Math.round(usualPct * 100))) / 10_000_000n : 0n;
      const priceKept = unit === formatDecimal(toHalalas(dbPrice));
      if (!(priceKept && toHalalas(disc) <= usualMax)) {
        if (!has(s, "pos.discount")) return { ok: false, error: "no_discount" };
        needsDiscountApproval = true;
      }
    }
    out.push({ variant_id: l.variantId, qty: q, unit_price: unit, discount: disc });
  }
  let approvedBy: string | null = null;
  if (needsDiscountApproval) {
    const a = await checkApproval(s, "approval.discount", approver.u, approver.p);
    if (!a.ok) return { ok: false, error: a.error };
    approvedBy = a.approverId;
  }
  return { ok: true, lines: out, approvedBy };
}

// ---------------------------------------------------------------- quotation (desk)
export async function saveQuotationAction(input: { clientId: string; locationId: string; salespersonId?: string; customerId?: string; lines: CartLine[]; approverUsername?: string; approverPin?: string }): Promise<PosResult<{ quoteNo: number }>> {
  const s = await requireStaff();
  if (!has(s, "pos.desk")) return { ok: false, error: "forbidden" };
  if (!isId(input.clientId) || !(await posLocationOk(s, input.locationId))) return { ok: false, error: "location_not_allowed" };
  const priced = await priceLines(s, input.lines, { u: input.approverUsername, p: input.approverPin }, input.customerId);
  if (!priced.ok) return priced;
  const { data, error } = await db().rpc("save_quotation", {
    p: {
      client_id: input.clientId, location_id: input.locationId, user_id: s.id,
      salesperson_id: isId(input.salespersonId) ? input.salespersonId : s.id,
      customer_id: isId(input.customerId) ? input.customerId : null, lines: priced.lines,
    },
  });
  if (error) return { ok: false, error: sqlError(error.message) };
  if (!data.duplicate) await audit(s.id, "pos.quotation", "quotation", data.quotation_id, { quote_no: data.quote_no, total: data.gross_total });
  revalidatePath("/pos");
  return { ok: true, quoteNo: Number(data.quote_no) };
}

export async function cancelQuotationAction(quotationId: string): Promise<PosResult> {
  const s = await requireStaff();
  if (!has(s, "pos.desk", "pos.collect")) return { ok: false, error: "forbidden" };
  if (!isId(quotationId)) return { ok: false, error: "bad_request" };
  await db().from("quotations").update({ status: "cancelled" }).eq("id", quotationId).eq("status", "open");
  await audit(s.id, "pos.quotation_cancel", "quotation", quotationId);
  revalidatePath("/pos");
  return { ok: true };
}

/** Desk: change an open quotation (lines replaced and recomputed). */
export async function updateQuotationAction(input: { quotationId: string; customerId?: string; salespersonId?: string; lines: CartLine[]; approverUsername?: string; approverPin?: string }): Promise<PosResult<{ quoteNo: number }>> {
  const s = await requireStaff();
  if (!has(s, "pos.desk")) return { ok: false, error: "forbidden" };
  if (!isId(input.quotationId)) return { ok: false, error: "bad_request" };
  const { data: q } = await db().from("quotations").select("location_id, status").eq("id", input.quotationId).maybeSingle();
  if (!q || q.status !== "open" || !canUseLocation(s, q.location_id)) return { ok: false, error: "quote_not_found" };
  const priced = await priceLines(s, input.lines, { u: input.approverUsername, p: input.approverPin }, input.customerId);
  if (!priced.ok) return priced;
  const { data, error } = await db().rpc("update_quotation", {
    p: { quotation_id: input.quotationId, lines: priced.lines, customer_id: isId(input.customerId) ? input.customerId : null, salesperson_id: isId(input.salespersonId) ? input.salespersonId : null },
  });
  if (error) return { ok: false, error: sqlError(error.message) };
  await audit(s.id, "pos.quotation_edit", "quotation", input.quotationId, { quote_no: data.quote_no, total: data.gross_total });
  revalidatePath("/pos");
  return { ok: true, quoteNo: Number(data.quote_no) };
}

export type QuoteForCashier = { id: string; quoteNo: number; total: string; customerId: string | null; customer: PosCustomer | null; salespersonId: string | null; lines: { variantId: string; name: string; options: string; sku: string | null; qty: string; unitPrice: string; discount: string }[] };

export async function loadQuotationAction(quoteNo: number, locale: "ar" | "en"): Promise<PosResult<{ quote: QuoteForCashier }>> {
  const s = await requireStaff();
  if (!has(s, "pos.collect", "pos.desk")) return { ok: false, error: "forbidden" };
  const { data: q } = await db().from("quotations").select("id, quote_no, gross_total, customer_id, salesperson_id, location_id, status").eq("quote_no", Number(quoteNo)).maybeSingle();
  if (!q || q.status !== "open" || !canUseLocation(s, q.location_id)) return { ok: false, error: "quote_not_found" };
  const { data: lines } = await db().from("quotation_lines").select("line_no, variant_id, qty, unit_price, discount").eq("quotation_id", q.id).eq("active", true).order("line_no");
  const ids = (lines ?? []).map((l) => l.variant_id);
  const { data: names } = ids.length ? await db().from("variant_search").select("variant_id, name_en, name_ar, sku, option1, option2, option3").in("variant_id", ids) : { data: [] };
  const nm = new Map((names ?? []).map((n) => [n.variant_id, n]));
  const { data: c } = q.customer_id ? await db().from("customer_list").select("id, customer_no, name, phone, discount_pct, balance, credit_limit").eq("id", q.customer_id).maybeSingle() : { data: null };
  return {
    ok: true,
    quote: {
      id: q.id, quoteNo: q.quote_no, total: String(q.gross_total), customerId: q.customer_id,
      customer: c ? { id: c.id, customerNo: c.customer_no, name: c.name, phone: c.phone, discountPct: Number(c.discount_pct ?? 0), balance: fmt(c.balance), creditLimit: c.credit_limit === null ? null : fmt(c.credit_limit) } : null, salespersonId: q.salesperson_id,
      lines: (lines ?? []).map((l) => {
        const n = nm.get(l.variant_id);
        return {
          variantId: l.variant_id, name: String((locale === "ar" && n?.name_ar) || n?.name_en || ""),
          options: [n?.option1, n?.option2, n?.option3].filter(Boolean).join(" / "), sku: n?.sku ?? null,
          qty: String(l.qty), unitPrice: String(l.unit_price), discount: String(l.discount),
        };
      }),
    },
  };
}

// ---------------------------------------------------------------- sale
export type SaleInput = {
  clientId: string; locationId: string; shiftId: string; salespersonId?: string; customerId?: string; quotationId?: string;
  lines: CartLine[]; payments: { method: string; amount: string; reference?: string }[]; cashTendered?: string;
  offlineTempNo?: string; issuedAt?: string; approverUsername?: string; approverPin?: string;
  /** Several open quotations of one customer collected on this receipt. */
  quotationIds?: string[];
  /** A new customer typed at the till (e.g. offline): found or created by mobile when the sale is saved. */
  customerPhone?: string; customerName?: string;
};

export async function postSaleAction(input: SaleInput): Promise<PosResult<{ invoiceId: string; number: string; change: string; duplicate: boolean }>> {
  const s = await requireStaff();
  if (!has(s, "pos.collect", "pos.quick_sale")) return { ok: false, error: "forbidden" };
  if (!isId(input.clientId) || !isId(input.shiftId) || !(await posLocationOk(s, input.locationId))) return { ok: false, error: "location_not_allowed" };
  // A retried request must return the first result, even if prices changed meanwhile.
  const { data: done } = await db().from("invoices").select("id, number, change_given").eq("client_id", input.clientId).maybeSingle();
  if (done) return { ok: true, invoiceId: done.id, number: done.number, change: fmt(done.change_given), duplicate: true };

  // Customer: required on every receipt unless this person may skip it.
  let customerId = isId(input.customerId) ? input.customerId : null;
  if (!customerId && input.customerPhone) {
    const phone = normalizeSaudiMobile(String(input.customerPhone));
    const name = String(input.customerName ?? "").trim().slice(0, 200);
    if (!phone) return { ok: false, error: "bad_phone" };
    const { data: found } = await db().from("customers").select("id").eq("phone", phone).maybeSingle();
    if (found) customerId = found.id;
    else if (name) {
      const { data: made } = await db().from("customers").insert({ phone, name, created_by: s.id }).select("id, customer_no").single();
      if (made) { customerId = made.id; await audit(s.id, "customer.create", "customer", made.id, { customer_no: made.customer_no, from: input.offlineTempNo ? "pos-offline" : "pos" }); }
    }
  }
  if (!customerId && !has(s, "pos.skip_customer") && !input.offlineTempNo) return { ok: false, error: "customer_required" };

  let lines: PricedLine[];
  let approvedBy: string | null = null;
  const quoteIds = [...new Set([...(isId(input.quotationId) ? [input.quotationId] : []), ...(Array.isArray(input.quotationIds) ? input.quotationIds.filter(isId) : [])])].slice(0, 20);
  if (quoteIds.length) {
    // Collecting desk quotations: the quoted lines (already checked at the desk) are used, not the browser's.
    lines = [];
    for (const qid of quoteIds) {
      const { data: ql } = await db().from("quotation_lines").select("variant_id, qty, unit_price, discount").eq("quotation_id", qid).eq("active", true).order("line_no");
      if (!ql?.length) return { ok: false, error: "quote_not_found" };
      lines.push(...ql.map((l) => ({ variant_id: l.variant_id, qty: String(l.qty), unit_price: String(l.unit_price), discount: String(l.discount) })));
    }
  } else {
    const priced = await priceLines(s, input.lines, { u: input.approverUsername, p: input.approverPin }, input.customerId);
    if (!priced.ok) return priced;
    lines = priced.lines;
    approvedBy = priced.approvedBy;
  }
  const payments = (Array.isArray(input.payments) ? input.payments : []).slice(0, 10).map((p) => ({ method: String(p.method), amount: money(p.amount), reference: String(p.reference ?? "").slice(0, 100) }));
  if (!payments.length || payments.some((p) => !p.amount || p.amount === "0.00")) return { ok: false, error: "bad_payment" };
  const tendered = input.cashTendered ? money(input.cashTendered) : null;
  const { data, error } = await db().rpc("post_sale_multi", {
    p: {
      client_id: input.clientId, location_id: input.locationId, shift_id: input.shiftId, cashier_id: s.id,
      salesperson_id: isId(input.salespersonId) ? input.salespersonId : s.id,
      customer_id: customerId,
      quotation_id: quoteIds[0] ?? null, quotation_ids: quoteIds.length > 1 ? quoteIds : [],
      lines, payments, cash_tendered: tendered,
      issued_at: input.issuedAt && !Number.isNaN(Date.parse(input.issuedAt)) ? new Date(input.issuedAt).toISOString() : null,
      offline_temp_no: input.offlineTempNo ? String(input.offlineTempNo).slice(0, 40) : null,
      approved_by: approvedBy,
    },
  });
  if (error) return { ok: false, error: sqlError(error.message) };
  if (!data.duplicate) after(() => pushStockForInvoice(String(data.invoice_id), input.locationId));
  if (!data.duplicate) await audit(s.id, "pos.sale", "invoice", data.invoice_id, { number: data.number, total: data.gross_total, approved_by: approvedBy, offline: input.offlineTempNo ?? null });
  revalidatePath("/sales");
  return { ok: true, invoiceId: String(data.invoice_id), number: String(data.number), change: fmt(data.change ?? "0"), duplicate: Boolean(data.duplicate) };
}

// ---------------------------------------------------------------- returns
export type InvoiceForReturn = { id: string; number: string; issuedAt: string; customerId: string | null; total: string; lines: { lineNo: number; name: string; sku: string | null; qty: string; returnable: string; gross: string }[] };

export async function findInvoiceForReturnAction(number: string): Promise<PosResult<{ invoice: InvoiceForReturn }>> {
  const s = await requireStaff();
  if (!has(s, "pos.return")) return { ok: false, error: "forbidden" };
  const n = String(number ?? "").trim().toUpperCase().slice(0, 40);
  const { data: inv } = await db().from("invoices").select("id, number, issued_at, customer_id, gross_total, location_id, kind").eq("number", n).maybeSingle();
  if (!inv || inv.kind !== "invoice" || !canUseLocation(s, inv.location_id)) return { ok: false, error: "invoice_not_found" };
  const { data: lines } = await db().from("invoice_lines").select("line_no, name, sku, qty, returned_qty, gross").eq("invoice_id", inv.id).order("line_no");
  return {
    ok: true,
    invoice: {
      id: inv.id, number: inv.number, issuedAt: inv.issued_at, customerId: inv.customer_id, total: String(inv.gross_total),
      lines: (lines ?? []).map((l) => ({ lineNo: l.line_no, name: l.name, sku: l.sku, qty: String(l.qty), returnable: String(Number(l.qty) - Number(l.returned_qty)), gross: String(l.gross) })),
    },
  };
}

export type ReturnInput = {
  clientId: string; locationId: string; shiftId: string; originalInvoiceId?: string; customerId?: string; reason: string;
  lines: { lineNo?: number; variantId?: string; qty: string }[]; refundMethod: string; approverUsername?: string; approverPin?: string;
};

export async function postReturnAction(input: ReturnInput): Promise<PosResult<{ invoiceId: string; number: string; total: string }>> {
  const s = await requireStaff();
  if (!has(s, "pos.return")) return { ok: false, error: "forbidden" };
  if (!isId(input.clientId) || !isId(input.shiftId) || !(await posLocationOk(s, input.locationId))) return { ok: false, error: "location_not_allowed" };
  const { data: done } = await db().from("invoices").select("id, number, gross_total").eq("client_id", input.clientId).maybeSingle();
  if (done) return { ok: true, invoiceId: done.id, number: done.number, total: fmt(done.gross_total) };
  if (!isId(input.originalInvoiceId) && !has(s, "pos.return_no_receipt")) return { ok: false, error: "no_receipt_forbidden" };
  const a = await checkApproval(s, "approval.return", input.approverUsername, input.approverPin);
  if (!a.ok) return { ok: false, error: a.error };

  let lines: Record<string, unknown>[];
  let total = 0n;
  if (isId(input.originalInvoiceId)) {
    const { data: ol } = await db().from("invoice_lines").select("line_no, qty, gross").eq("invoice_id", input.originalInvoiceId);
    lines = [];
    for (const l of input.lines ?? []) {
      const q = qty(l.qty);
      const o = ol?.find((x) => x.line_no === Number(l.lineNo));
      if (!q || !o) return { ok: false, error: "bad_qty" };
      lines.push({ line_no: o.line_no, qty: q });
      // same pro-rata rounding as SQL, to know the refund total
      total += (toHalalas(String(o.gross)) * toMilliQty(q) * 2n + toMilliQty(String(o.qty))) / (toMilliQty(String(o.qty)) * 2n);
    }
  } else {
    // No receipt: current shelf price, nothing else.
    const priced = await priceLines(s, (input.lines ?? []).map((l) => ({ variantId: String(l.variantId), qty: l.qty })), {});
    if (!priced.ok) return priced;
    lines = priced.lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty, unit_price: l.unit_price }));
    for (const l of priced.lines) total += (toHalalas(l.unit_price) * toMilliQty(l.qty) * 2n + 1000n) / 2000n;
  }
  if (!lines.length) return { ok: false, error: "no_lines" };
  const { data, error } = await db().rpc("post_return", {
    p: {
      client_id: input.clientId, location_id: input.locationId, shift_id: input.shiftId, cashier_id: s.id,
      original_invoice_id: isId(input.originalInvoiceId) ? input.originalInvoiceId : null,
      customer_id: isId(input.customerId) ? input.customerId : null,
      reason: String(input.reason ?? "").slice(0, 300), lines,
      payments: [{ method: String(input.refundMethod), amount: formatDecimal(total) }],
      approved_by: a.approverId,
    },
  });
  if (error) return { ok: false, error: sqlError(error.message) };
  if (!data.duplicate) after(() => pushStockForInvoice(String(data.invoice_id), input.locationId));
  if (!data.duplicate) await audit(s.id, "pos.return", "invoice", data.invoice_id, { number: data.number, total: data.gross_total, original: input.originalInvoiceId ?? null, approved_by: a.approverId });
  revalidatePath("/sales");
  return { ok: true, invoiceId: String(data.invoice_id), number: String(data.number), total: fmt(data.gross_total) };
}

// ---------------------------------------------------------------- customers at the till
export type PosCustomer = { id: string; customerNo: number; name: string; phone: string; discountPct?: number; balance?: string; creditLimit?: string | null };

export async function findCustomerAction(phoneOrNo: string): Promise<PosResult<{ customer: PosCustomer | null }>> {
  const s = await requireStaff();
  if (!has(s, "customers.view", "pos.collect", "pos.desk", "pos.quick_sale")) return { ok: false, error: "forbidden" };
  const raw = String(phoneOrNo ?? "").trim();
  const phone = normalizeSaudiMobile(raw);
  const q = phone
    ? db().from("customers").select("id, customer_no, name, phone").eq("phone", phone)
    : /^\d{1,7}$/.test(raw) ? db().from("customers").select("id, customer_no, name, phone").eq("customer_no", Number(raw)) : null;
  if (!q) return { ok: true, customer: null };
  const { data } = await q.maybeSingle();
  return { ok: true, customer: data ? { id: data.id, customerNo: data.customer_no, name: data.name, phone: data.phone } : null };
}

export async function quickAddCustomerAction(phoneRaw: string, name: string): Promise<PosResult<{ customer: PosCustomer }>> {
  const s = await requireStaff();
  if (!has(s, "customers.edit", "pos.collect", "pos.desk", "pos.quick_sale")) return { ok: false, error: "forbidden" };
  const phone = normalizeSaudiMobile(String(phoneRaw ?? ""));
  if (!phone) return { ok: false, error: "bad_phone" };
  const { data: existing } = await db().from("customers").select("id, customer_no, name, phone").eq("phone", phone).maybeSingle();
  if (existing) return { ok: true, customer: { id: existing.id, customerNo: existing.customer_no, name: existing.name, phone: existing.phone } };
  const { data, error } = await db().from("customers").insert({ phone, name: String(name ?? "").trim().slice(0, 200), created_by: s.id }).select("id, customer_no, name, phone").single();
  if (error || !data) return { ok: false, error: error?.message ?? "error" };
  await audit(s.id, "customer.create", "customer", data.id, { customer_no: data.customer_no, from: "pos" });
  return { ok: true, customer: { id: data.id, customerNo: data.customer_no, name: data.name, phone: data.phone } };
}

// ---------------------------------------------------------------- offline till
/** The device's copy of the price list: every active item with its barcode, extra codes and VAT-inclusive price. */
export async function posCatalogAction(locale: "ar" | "en" = "en"): Promise<PosResult<{ items: { v: string; n: string; o: string; s: string | null; c: string[]; p: string; x: boolean }[] }>> {
  const s = await requireStaff();
  if (!has(s, "pos.collect", "pos.quick_sale")) return { ok: false, error: "forbidden" };
  const PAGE = 1000;
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await db().from("variant_search")
      .select("variant_id, sku, price, option1, option2, option3, name_en, name_ar, is_service")
      .eq("active", true).eq("product_active", true).order("variant_id").range(from, from + PAGE - 1);
    if (error) return { ok: false, error: "bad_request" };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  const codes = new Map<string, string[]>();
  for (let from = 0; from < 100_000; from += PAGE) {
    const { data } = await db().from("product_codes").select("variant_id, code").order("code").range(from, from + PAGE - 1);
    for (const c of data ?? []) codes.set(c.variant_id, [...(codes.get(c.variant_id) ?? []), c.code]);
    if (!data || data.length < PAGE) break;
  }
  return {
    ok: true,
    items: rows.map((r) => ({
      v: String(r.variant_id),
      n: String((locale === "ar" && r.name_ar) || r.name_en || r.name_ar),
      o: [r.option1, r.option2, r.option3].filter(Boolean).join(" / "),
      s: (r.sku as string) ?? null,
      c: codes.get(String(r.variant_id)) ?? [],
      p: fmt(r.price),
      x: Boolean(r.is_service),
    })),
  };
}

/** Customers by mobile, name or serial customer number (with usual discount, balance and credit limit). */
export async function searchCustomersAction(term: string): Promise<PosResult<{ customers: PosCustomer[] }>> {
  const s = await requireStaff();
  if (!has(s, "customers.view", "pos.collect", "pos.desk", "pos.quick_sale")) return { ok: false, error: "forbidden" };
  const t = String(term ?? "").trim().slice(0, 60);
  if (!t) return { ok: true, customers: [] };
  const cols = "id, customer_no, name, phone, discount_pct, balance, credit_limit";
  const phone = normalizeSaudiMobile(t);
  let rows: Record<string, unknown>[] = [];
  if (phone) rows = (await db().from("customer_list").select(cols).eq("phone", phone).limit(1)).data ?? [];
  else if (/^\d{1,9}$/.test(t)) rows = (await db().from("customer_list").select(cols).eq("customer_no", Number(t)).limit(1)).data ?? [];
  if (!rows.length) rows = (await db().from("customer_list").select(cols).ilike("name", `%${t.replace(/[%_\\]/g, "")}%`).order("name").limit(10)).data ?? [];
  return {
    ok: true,
    customers: rows.map((r) => ({ id: String(r.id), customerNo: Number(r.customer_no), name: String(r.name ?? ""), phone: String(r.phone), discountPct: Number(r.discount_pct ?? 0), balance: fmt(r.balance), creditLimit: r.credit_limit === null ? null : fmt(r.credit_limit) })),
  };
}

export async function expenseTypesAction(locale: "ar" | "en"): Promise<{ id: string; name: string }[]> {
  await requireStaff();
  const { data } = await db().from("expense_types").select("id, name_en, name_ar").eq("active", true).order("sort");
  return (data ?? []).map((e) => ({ id: e.id, name: (locale === "ar" && e.name_ar) || e.name_en }));
}
