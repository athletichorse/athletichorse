"use server";

import { revalidatePath } from "next/cache";
import { assertPermission, canUseLocation, requireStaff } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { checkApproval } from "@/lib/approval";
import { audit } from "@/lib/audit";
import type { PermissionKey } from "@/lib/permissions";

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
};
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
  const lines = (Array.isArray(input.lines) ? input.lines : []).slice(0, 500);
  if (!lines.length) return { ok: false, error: "no_lines" };
  const clean: { variant_id: string; qty: string }[] = [];
  for (const l of lines) {
    const q = String(l.qty ?? "").trim();
    const okQty = kind === "adjust" ? /^-?\d{1,9}(\.\d{1,3})?$/.test(q) && Number(q) !== 0 : kind === "count" ? /^\d{1,9}(\.\d{1,3})?$/.test(q) : /^\d{1,9}(\.\d{1,3})?$/.test(q) && Number(q) > 0;
    if (!UUID.test(String(l.variantId)) || !okQty) return { ok: false, error: "bad_qty" };
    clean.push({ variant_id: l.variantId, qty: q });
  }

  const rule = kind === "receipt" ? "approval.stock_receive" : kind === "write_off" || kind === "adjust" ? "approval.write_off" : null;
  let approverId: string | null = null;
  if (rule) {
    const a = await checkApproval(staff, rule, input.approverUsername, input.approverPin);
    if (!a.ok) return { ok: false, error: a.error };
    approverId = a.approverId;
  }

  const { data, error } = await db().rpc("post_stock_doc", {
    p_client_id: input.clientId,
    p_kind: kind,
    p_location: input.locationId,
    p_to_location: kind === "transfer" ? input.toLocationId : null,
    p_lines: clean,
    p_note: String(input.note ?? "").slice(0, 500),
    p_user: staff.id,
    p_approved_by: approverId,
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.duplicate) await audit(staff.id, `stock.${kind}`, "stock_doc", String(data.doc_id), { doc_no: data.doc_no, lines: clean.length, approved_by: approverId });
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
