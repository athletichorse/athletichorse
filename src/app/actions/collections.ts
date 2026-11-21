"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { codAmount } from "@/lib/order-follow";

export type CollectionInput = {
  clientId: string; courier: string; ref: string; receivedOn: string; method: "bank" | "cash"; notes: string;
  lines: { orderId: string; collected: string; fee: string }[];
};
const UUID = /^[0-9a-f-]{36}$/i;
const money = (v: string) => (/^\d{1,9}(\.\d{1,2})?$/.test(String(v ?? "").trim()) ? Number(v).toFixed(2) : null);

/** Saves a payment from a shipping company; its orders become "collected" (one transaction, saved once). */
export async function saveCollectionAction(input: CollectionInput): Promise<{ ok: true; orders: number; received: string; fees: string; duplicate: boolean } | { ok: false; error: string }> {
  const s = await requireStaff();
  if (!s.perms.has("sales.website_orders")) return { ok: false, error: "forbidden" };
  if (!UUID.test(input?.clientId ?? "")) return { ok: false, error: "bad_request" };
  const courier = String(input.courier ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!courier) return { ok: false, error: "courier_required" };
  if (input.receivedOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.receivedOn)) return { ok: false, error: "bad_date" };
  const lines = (Array.isArray(input.lines) ? input.lines : []).slice(0, 2000);
  if (!lines.length) return { ok: false, error: "no_orders" };
  if (lines.some((l) => !UUID.test(l.orderId) || money(l.collected) === null || money(l.fee || "0") === null)) return { ok: false, error: "bad_amount" };
  // the expected amount comes from the order itself, never from the browser
  const { data: orders } = await db().from("web_orders").select("id, name, financial_status, total").in("id", lines.map((l) => l.orderId));
  if ((orders ?? []).length !== new Set(lines.map((l) => l.orderId)).size) return { ok: false, error: "not_found" };
  const exp = new Map((orders ?? []).map((o) => [o.id, codAmount(o).toFixed(2)]));
  const { data, error } = await db().rpc("post_collection", {
    p: {
      client_id: input.clientId, courier, ref: String(input.ref ?? "").trim().slice(0, 60), received_on: input.receivedOn || null,
      method: input.method === "cash" ? "cash" : "bank", notes: String(input.notes ?? "").slice(0, 500), user_id: s.id,
      lines: lines.map((l) => ({ order_id: l.orderId, expected: exp.get(l.orderId), collected: money(l.collected), fee: money(l.fee || "0") })),
    },
  });
  if (error) return { ok: false, error: error.message };
  if (!data.duplicate) await audit(s.id, "collection.create", "courier_collection", String(data.id), { courier, ref: input.ref, orders: data.orders, received: data.received, fees: data.fees });
  revalidatePath("/sales/collections");
  revalidatePath("/sales/orders");
  return { ok: true, orders: Number(data.orders ?? lines.length), received: Number(data.received ?? 0).toFixed(2), fees: Number(data.fees ?? 0).toFixed(2), duplicate: Boolean(data.duplicate) };
}
