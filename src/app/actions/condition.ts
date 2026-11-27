"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { canUseLocation, requireStaff } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { pushStockIfWebsite } from "@/lib/website-push";
import { CONDITIONS, DEFECT_ACTIONS, condError, type Condition } from "@/lib/condition";
import { num } from "@/lib/purchasing";

const UUID = /^[0-9a-f-]{36}$/i;

/** How many pieces of an item in a store are sound / damaged / partly faulty. */
export async function conditionInfoAction(locationId: string, variantId: string): Promise<{ onHand: number; good: number; damaged: number; partial: number } | null> {
  const s = await requireStaff();
  if (!s.perms.has("stock.view") && !s.perms.has("stock.condition")) return null;
  if (!UUID.test(locationId) || !UUID.test(variantId)) return null;
  const [{ data: lv }, { data: c }] = await Promise.all([
    db().from("stock_levels").select("qty").eq("location_id", locationId).eq("variant_id", variantId).maybeSingle(),
    db().from("stock_condition").select("damaged, partial").eq("location_id", locationId).eq("variant_id", variantId).maybeSingle(),
  ]);
  const onHand = Number(lv?.qty ?? 0), damaged = Number(c?.damaged ?? 0), partial = Number(c?.partial ?? 0);
  return { onHand, damaged, partial, good: Math.max(0, onHand - damaged - partial) };
}

export async function changeConditionAction(input: { clientId: string; locationId: string; variantId: string; from: string; to: string; qty: string; note?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await requireStaff();
  if (!s.perms.has("stock.condition")) return { ok: false, error: "forbidden" };
  if (!UUID.test(input.clientId) || !UUID.test(input.variantId)) return { ok: false, error: "pick_item" };
  if (!UUID.test(input.locationId) || !canUseLocation(s, input.locationId)) return { ok: false, error: "location_not_allowed" };
  const from = input.from as Condition, to = input.to as Condition;
  if (!CONDITIONS.includes(from) || !CONDITIONS.includes(to) || from === to) return { ok: false, error: "bad_condition" };
  const qty = num(input.qty, 3);
  if (!qty) return { ok: false, error: "bad_qty" };
  const { data, error } = await db().rpc("change_item_condition", {
    p: { client_id: input.clientId, location_id: input.locationId, variant_id: input.variantId, from_cond: from, to_cond: to, qty, note: String(input.note ?? "").slice(0, 300), user_id: s.id },
  });
  if (error) return { ok: false, error: condError(error.message) };
  if (!data?.duplicate) await audit(s.id, "stock.condition", "stock_condition", input.variantId, { location: input.locationId, from, to, qty });
  revalidatePath("/stock");
  revalidatePath("/stock/condition");
  revalidatePath("/stock/defects");
  return { ok: true };
}

/** The owner's decision for faulty pieces (form on /stock/defects). */
export async function settleDefectAction(form: FormData) {
  const s = await requireStaff();
  const back = (q: string) => redirect(`/stock/defects?${q}`);
  if (!s.perms.has("stock.defects")) back("err=forbidden");
  const loc = String(form.get("location_id") ?? ""), variant = String(form.get("variant_id") ?? ""), clientId = String(form.get("client_id") ?? "");
  const cond = String(form.get("cond") ?? ""), action = String(form.get("action") ?? ""), supplier = String(form.get("supplier_id") ?? "");
  if (!UUID.test(loc) || !UUID.test(variant) || !UUID.test(clientId)) back("err=pick_item");
  if (cond !== "damaged" && cond !== "partial") back("err=bad_condition");
  if (!(DEFECT_ACTIONS as readonly string[]).includes(action)) back("err=bad_action");
  if (action === "return_supplier" && !UUID.test(supplier)) back("err=bad_supplier");
  const qty = num(form.get("qty"), 3);
  if (!qty) back("err=bad_qty");
  const { data, error } = await db().rpc("settle_defect", {
    p: { client_id: clientId, location_id: loc, variant_id: variant, cond, action, qty, supplier_id: action === "return_supplier" ? supplier : null, note: String(form.get("note") ?? "").slice(0, 300), user_id: s.id },
  });
  if (error) back(`err=${encodeURIComponent(condError(error.message))}`);
  if (!data?.duplicate) {
    await audit(s.id, "stock.defect_settle", "defect_action", String(data.id), { location: loc, variant, cond, action, qty });
    if (action !== "repair") after(() => pushStockIfWebsite([loc], [variant]));
  }
  revalidatePath("/stock");
  revalidatePath("/stock-log");
  revalidatePath("/stock/condition");
  back("ok=1");
}
