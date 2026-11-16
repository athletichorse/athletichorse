"use server";

import { revalidatePath } from "next/cache";
import { assertPermission, canUseLocation, requireStaff } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { checkApproval } from "@/lib/approval";
import { audit } from "@/lib/audit";
import type { PermissionKey } from "@/lib/permissions";
import { after } from "next/server";
import { pushStockIfWebsite } from "@/lib/website-push";

export type StockKind = "receipt" | "transfer" | "write_off" | "count" | "adjust";
export type StockDocInput = {
  clientId: string;
  kind: StockKind;
  locationId: string;
  toLocationId?: string | null;
  note?: string;
  lines: { variantId: string; qty: string }[];
  approverUsername?: string;
  approverPin?: string;
  /** write-offs: damaged | lost | waste | expired | other */
  reason?: string;
  /** a restock request this transfer answers */
  requestId?: string;
};
const WRITE_OFF_REASONS = ["damaged", "lost", "waste", "expired", "other"] as const;
export type StockDocResult = { ok: true; docNo: number; duplicate: boolean } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERM: Record<StockKind, PermissionKey> = { receipt: "stock.receive", transfer: "stock.transfer", write_off: "stock.write_off", count: "stock.count", adjust: "stock.count" };

/** Posts a stock document through post_stock_doc() (one transaction, idempotent by clientId). */
export async function postStockDocAction(input: StockDocInput): Promise<StockDocResult> {
  const kind = input?.kind;
  if (!kind || !(kind in PERM)) return { ok: false, error: "bad_kind" };
  const staff = await assertPermission(PERM[kind]);
  if (!UUID.test(String(input.clientId)) || !UUID.test(String(input.locationId))) return { ok: false, error: "bad_request" };
  if (!canUseLocation(staff, input.locationId)) return { ok: false, error: "location_not_allowed" };
  if (kind === "transfer") {
    if (!input.toLocationId || !UUID.test(input.toLocationId) || input.toLocationId === input.locationId) return { ok: false, error: "bad_target" };
  }
  const lines = (Array.isArray(input.lines) ? input.lines : []).slice(0, kind === "count" ? 10_000 : 500);
  if (!lines.length) return { ok: false, error: "no_lines" };
  const clean: { variant_id: string; qty: string }[] = [];
  for (const l of lines) {
    const q = String(l.qty ?? "").trim();
    const okQty = kind === "adjust" ? /^-?\d{1,9}(\.\d{1,3})?$/.test(q) && Number(q) !== 0 : kind === "count" ? /^\d{1,9}(\.\d{1,3})?$/.test(q) : /^\d{1,9}(\.\d{1,3})?$/.test(q) && Number(q) > 0;
    if (!UUID.test(String(l.variantId)) || !okQty) return { ok: false, error: "bad_qty" };
    clean.push({ variant_id: l.variantId, qty: q });
  }

  if (kind === "write_off" && !(WRITE_OFF_REASONS as readonly string[]).includes(String(input.reason))) return { ok: false, error: "reason_required" };
  const rule = kind === "receipt" ? "approval.stock_receive" : kind === "write_off" || kind === "adjust" ? "approval.write_off" : null;
  let approverId: string | null = null;
  if (rule) {
    const a = await checkApproval(staff, rule, input.approverUsername, input.approverPin);
    if (!a.ok) return { ok: false, error: a.error };
    approverId = a.approverId;
  }

  const { data, error } = await db().rpc("post_stock_doc2", {
    p: {
      client_id: input.clientId, kind, location_id: input.locationId, to_location_id: kind === "transfer" ? input.toLocationId : null,
      lines: clean, note: String(input.note ?? "").slice(0, 500), reason: kind === "write_off" ? input.reason : null,
      user_id: staff.id, approved_by: approverId, request_id: kind === "transfer" && UUID.test(String(input.requestId)) ? input.requestId : null,
    },
  });
  if (error) return { ok: false, error: /reason_required|bad_target/.test(error.message) ? error.message.match(/reason_required|bad_target/)![0] : error.message };
  if (!data?.duplicate) await audit(staff.id, `stock.${kind}`, "stock_doc", String(data.doc_id), { doc_no: data.doc_no, lines: clean.length, approved_by: approverId });
  if (!data?.duplicate) {
    const vids = clean.map((l) => l.variant_id);
    after(() => pushStockIfWebsite([input.locationId, kind === "transfer" ? input.toLocationId : null], vids));
  }
  revalidatePath("/stock");
  revalidatePath("/stock-log");
  return { ok: true, docNo: Number(data.doc_no), duplicate: Boolean(data.duplicate) };
}

export type VariantHit = { variantId: string; name: string; options: string; sku: string | null; price: string; image: string | null; isService: boolean; exact: boolean };

/** Find items by scanned code (exact SKU / extra code first) or by name. */
export async function searchVariantsAction(q: string, locale: "ar" | "en" = "en"): Promise<VariantHit[]> {
  const s = await requireStaff();
  if (!["stock.view", "pos.collect", "pos.desk", "pos.quick_sale", "products.view"].some((k) => s.perms.has(k as PermissionKey))) return [];
  const term = String(q ?? "").trim().slice(0, 60);
  if (!term) return [];
  const map = (r: Record<string, unknown>, exact: boolean): VariantHit => ({
    variantId: String(r.variant_id),
    name: String((locale === "ar" && r.name_ar) || r.name_en || r.name_ar),
    options: [r.option1, r.option2, r.option3].filter(Boolean).join(" / "),
    sku: (r.sku as string) ?? null,
    price: String(r.price),
    image: (r.image_url as string) ?? null,
    isService: Boolean(r.is_service),
    exact,
  });
  const cols = "variant_id, sku, price, option1, option2, option3, image_url, name_en, name_ar, is_service";
  const exact = await db().from("variant_search").select(cols).eq("sku", term).eq("active", true).limit(1);
  if (exact.data?.length) return exact.data.map((r) => map(r, true));
  const code = await db().from("product_codes").select("variant_id").eq("code", term).limit(1);
  if (code.data?.length) {
    const r = await db().from("variant_search").select(cols).eq("variant_id", code.data[0].variant_id).limit(1);
    return (r.data ?? []).map((x) => map(x, true));
  }
  const like = await db()
    .from("variant_search")
    .select(cols)
    .eq("active", true)
    .eq("product_active", true)
    .ilike("search", `%${term.toLowerCase().replace(/[%_\\]/g, "")}%`)
    .order("name_en")
    .limit(20);
  return (like.data ?? []).map((r) => map(r, false));
}

// ---------------------------------------------------------------- transfers: receive
/** The receiving store confirms what arrived (per line). Shortages and extras stay on the document. */
export async function receiveTransferAction(docId: string, lines: { lineNo: number; receivedQty: string }[]): Promise<{ ok: true; shortage: string; extra: string } | { ok: false; error: string }> {
  const staff = await requireStaff();
  if (!staff.perms.has("stock.transfer") && !staff.perms.has("stock.receive")) return { ok: false, error: "forbidden" };
  if (!UUID.test(String(docId))) return { ok: false, error: "bad_request" };
  const { data: d } = await db().from("stock_docs").select("id, to_location_id, status, doc_no").eq("id", docId).eq("kind", "transfer").maybeSingle();
  if (!d || !d.to_location_id) return { ok: false, error: "bad_request" };
  if (!canUseLocation(staff, d.to_location_id)) return { ok: false, error: "location_not_allowed" };
  if (d.status === "received") return { ok: false, error: "already_done" };
  const clean = (Array.isArray(lines) ? lines : []).slice(0, 500).map((l) => ({ line_no: Number(l.lineNo), received_qty: String(l.receivedQty ?? "0").trim() || "0" }));
  if (clean.some((l) => !Number.isInteger(l.line_no) || !/^\d{1,9}(\.\d{1,3})?$/.test(l.received_qty))) return { ok: false, error: "bad_qty" };
  const { data, error } = await db().rpc("receive_transfer", { p_doc: docId, p_lines: clean, p_user: staff.id });
  if (error) return { ok: false, error: error.message };
  if (!data?.duplicate) after(async () => {
    const { data: ls } = await db().from("stock_doc_lines").select("variant_id").eq("doc_id", docId);
    await pushStockIfWebsite([d.to_location_id], (ls ?? []).map((l) => l.variant_id));
  });
  if (!data?.duplicate) await audit(staff.id, "stock.transfer_received", "stock_doc", docId, { doc_no: d.doc_no, shortage: data?.shortage, extra: data?.extra });
  revalidatePath("/stock");
  revalidatePath("/stock/docs");
  return { ok: true, shortage: String(data?.shortage ?? 0), extra: String(data?.extra ?? 0) };
}

// ---------------------------------------------------------------- restock requests
export type RequestInput = { clientId: string; toLocationId: string; fromLocationId?: string | null; note?: string; lines: { variantId: string; qty: string }[] };

export async function createRequestAction(input: RequestInput): Promise<{ ok: true; requestNo: number } | { ok: false; error: string }> {
  const staff = await assertPermission("stock.requests");
  if (!UUID.test(String(input.clientId)) || !UUID.test(String(input.toLocationId))) return { ok: false, error: "bad_request" };
  if (!canUseLocation(staff, input.toLocationId)) return { ok: false, error: "location_not_allowed" };
  if (input.fromLocationId && (!UUID.test(input.fromLocationId) || input.fromLocationId === input.toLocationId)) return { ok: false, error: "bad_target" };
  const lines = (Array.isArray(input.lines) ? input.lines : []).slice(0, 500);
  if (!lines.length) return { ok: false, error: "no_lines" };
  if (lines.some((l) => !UUID.test(String(l.variantId)) || !/^\d{1,9}(\.\d{1,3})?$/.test(String(l.qty).trim()) || Number(l.qty) <= 0)) return { ok: false, error: "bad_qty" };
  const { data, error } = await db().rpc("create_stock_request", {
    p: { client_id: input.clientId, to_location_id: input.toLocationId, from_location_id: input.fromLocationId || null, note: String(input.note ?? "").slice(0, 300), user_id: staff.id,
         lines: lines.map((l) => ({ variant_id: l.variantId, qty: String(l.qty).trim() })) },
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.duplicate) await audit(staff.id, "stock.request", "stock_request", String(data.request_id), { request_no: data.request_no, lines: lines.length });
  revalidatePath("/stock/requests");
  return { ok: true, requestNo: Number(data.request_no) };
}

export async function cancelRequestAction(form: FormData) {
  const staff = await assertPermission("stock.requests");
  const id = String(form.get("id") ?? "");
  if (!UUID.test(id)) return;
  const { data: r } = await db().from("stock_requests").select("to_location_id, from_location_id, status").eq("id", id).maybeSingle();
  if (!r || r.status !== "open") return;
  if (!canUseLocation(staff, r.to_location_id) && !(r.from_location_id && canUseLocation(staff, r.from_location_id))) return;
  await db().from("stock_requests").update({ status: "cancelled" }).eq("id", id).eq("status", "open");
  await audit(staff.id, "stock.request_cancel", "stock_request", id, {});
  revalidatePath("/stock/requests");
}
