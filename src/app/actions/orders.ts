"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { runOrdersSync, syncOneOrder } from "@/lib/shopify-sync";
import { FOLLOW_STATUSES } from "@/lib/order-follow";

type Field = "status" | "courier" | "waybill" | "size" | "branch_id" | "notes";

const allowed = async () => {
  const s = await requireStaff();
  return s.perms.has("sales.website_orders") ? s : null;
};

/** One cell of the follow-up table: saved on its own as soon as it changes. */
export async function saveFollowAction(orderId: string, field: Field, value: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await allowed();
  if (!s) return { ok: false, error: "forbidden" };
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return { ok: false, error: "bad_request" };
  const v = String(value ?? "").trim();
  let clean: string | null;
  switch (field) {
    case "status": if (!(FOLLOW_STATUSES as readonly string[]).includes(v)) return { ok: false, error: "bad_request" }; clean = v; break;
    case "size": if (v !== "normal" && v !== "bulky") return { ok: false, error: "bad_request" }; clean = v; break;
    case "branch_id": if (v && !/^[0-9a-f-]{36}$/i.test(v)) return { ok: false, error: "bad_request" }; clean = v || null; break;
    case "courier": case "waybill": clean = v.replace(/\s+/g, " ").slice(0, 60) || null; break;
    case "notes": clean = v.slice(0, 500); break;
    default: return { ok: false, error: "bad_request" };
  }
  const { data: order } = await db().from("web_orders").select("id, name").eq("id", orderId).maybeSingle();
  if (!order) return { ok: false, error: "not_found" };
  const { error } = await db().from("web_order_follow").upsert({ order_id: orderId, [field]: clean, updated_by: s.id, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: error.message };
  if (field === "status" || field === "waybill") await audit(s.id, `order.${field}`, "web_order", orderId, { order: order.name, value: clean });
  return { ok: true };
}

/** "Fetch website orders": the same full check the nightly sync does, now. */
export async function fetchWebOrdersAction() {
  const s = await allowed();
  if (!s) redirect("/forbidden");
  const r = await runOrdersSync("manual", s.id);
  revalidatePath("/sales/orders");
  redirect(r.ok ? `/sales/orders?fetched=${Number(r.counts?.fetched ?? 0)}` : `/sales/orders?err=${encodeURIComponent(r.error ?? "sync")}`);
}

/** Add one website order by its number (when it hasn't arrived yet). */
export async function addOrderAction(form: FormData) {
  const s = await allowed();
  if (!s) redirect("/forbidden");
  const n = String(form.get("number") ?? "").trim();
  const r = await syncOneOrder(n);
  revalidatePath("/sales/orders");
  if (!r.ok) redirect(`/sales/orders?err=${encodeURIComponent(r.error)}`);
  redirect(r.found ? `/sales/orders?added=${encodeURIComponent(n.replace(/^#/, ""))}` : `/sales/orders?err=order_not_found`);
}
