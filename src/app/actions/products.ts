"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { formatDecimal, toHalalas } from "@/lib/money";
import { after } from "next/server";
import { finishShopifySync, startShopifySync } from "@/lib/shopify-sync";

const CODE = /^[A-Za-z0-9._/-]{1,40}$/;
const UNITS = ["piece", "pair", "set", "box", "kg", "m"] as const;

/** "" → null; "12.5" → "12.50"; junk → throws. */
function money(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const h = toHalalas(s);
  if (h < 0n) throw new Error("negative");
  return formatDecimal(h);
}

function friendly(msg: string): string {
  if (/duplicate key|already the SKU|already an extra code/i.test(msg)) return "duplicate";
  return msg;
}

function readProduct(form: FormData) {
  const unit = String(form.get("unit") ?? "piece");
  return {
    name_en: String(form.get("name_en") ?? "").trim(),
    name_ar: String(form.get("name_ar") ?? "").trim(),
    group_id: String(form.get("group_id") ?? "") || null,
    subgroup_id: String(form.get("subgroup_id") ?? "") || null,
    unit: (UNITS as readonly string[]).includes(unit) ? unit : "piece",
    is_service: form.get("is_service") === "on",
  };
}

export async function saveProductAction(form: FormData) {
  const staff = await assertPermission("products.edit");
  const canCost = staff.perms.has("products.view_cost");
  const id = String(form.get("id") ?? "");
  const back = (err?: string) => redirect(`/products/${id}${err ? `?err=${encodeURIComponent(err)}` : "?ok=1"}`);

  const { data: product } = await db().from("products").select("id, shopify_product_id").eq("id", id).maybeSingle();
  if (!product) return back("not found");
  const fromWebsite = product.shopify_product_id !== null;

  const p = readProduct(form);
  const update: Record<string, unknown> = { name_ar: p.name_ar, group_id: p.group_id, subgroup_id: p.subgroup_id, unit: p.unit, is_service: p.is_service, active: form.get("active") === "on" };
  if (!fromWebsite) {
    if (!p.name_en) return back("name");
    update.name_en = p.name_en;
  }
  const { error } = await db().from("products").update(update).eq("id", id);
  if (error) return back(error.message);

  const { data: variants } = await db().from("product_variants").select("id, shopify_variant_id").eq("product_id", id);
  for (const v of variants ?? []) {
    const sku = String(form.get(`sku:${v.id}`) ?? "").trim() || null;
    if (sku && !CODE.test(sku)) return back("sku");
    let cost: string | null, price: string | null;
    try {
      cost = money(form.get(`cost:${v.id}`));
      price = v.shopify_variant_id === null ? money(form.get(`price:${v.id}`)) : null;
    } catch {
      return back("money");
    }
    const row: Record<string, unknown> = { sku, active: form.get(`active:${v.id}`) === "on" };
    if (canCost && form.has(`cost:${v.id}`)) row.cost = cost;
    if (v.shopify_variant_id === null && price !== null) row.price = price;
    const { error: e } = await db().from("product_variants").update(row).eq("id", v.id);
    if (e) return back(friendly(e.message));

    const codes = [...new Set(String(form.get(`codes:${v.id}`) ?? "").split(/[,\s]+/).map((c) => c.trim()).filter(Boolean))];
    if (codes.some((c) => !CODE.test(c))) return back("sku");
    const { data: existing } = await db().from("product_codes").select("code").eq("variant_id", v.id);
    const drop = (existing ?? []).map((c) => c.code).filter((c) => !codes.includes(c));
    if (drop.length) await db().from("product_codes").delete().eq("variant_id", v.id).in("code", drop);
    const add = codes.filter((c) => !(existing ?? []).some((x) => x.code === c));
    if (add.length) {
      const { error: e2 } = await db().from("product_codes").insert(add.map((code) => ({ code, variant_id: v.id })));
      if (e2) return back(friendly(e2.message));
    }
  }
  revalidatePath("/products");
  back();
}

export async function createProductAction(form: FormData) {
  const staff = await assertPermission("products.edit");
  const back = (err: string) => redirect(`/products/new?err=${encodeURIComponent(err)}`);
  const p = readProduct(form);
  if (!p.name_en && !p.name_ar) return back("name");
  const sku = String(form.get("sku") ?? "").trim() || null;
  if (sku && !CODE.test(sku)) return back("sku");
  let price: string | null, cost: string | null;
  try {
    price = money(form.get("price"));
    cost = staff.perms.has("products.view_cost") ? money(form.get("cost")) : null;
  } catch {
    return back("money");
  }
  const { data: created, error } = await db()
    .from("products")
    .insert({ ...p, name_en: p.name_en || p.name_ar })
    .select("id")
    .single();
  if (error || !created) return back(error?.message ?? "error");
  const { error: e2 } = await db().from("product_variants").insert({ product_id: created.id, sku, price: price ?? "0.00", cost });
  if (e2) {
    await db().from("products").delete().eq("id", created.id);
    return back(friendly(e2.message));
  }
  revalidatePath("/products");
  redirect(`/products/${created.id}?ok=1`);
}

export async function createGroupAction(form: FormData) {
  await assertPermission("products.edit");
  const name_en = String(form.get("name_en") ?? "").trim();
  const name_ar = String(form.get("name_ar") ?? "").trim();
  const parent_id = String(form.get("parent_id") ?? "") || null;
  if (!name_en) redirect("/products/groups?err=name");
  const { error } = await db().from("product_groups").insert({ name_en, name_ar, parent_id });
  if (error) redirect(`/products/groups?err=${encodeURIComponent(friendly(error.message))}`);
  revalidatePath("/products/groups");
  redirect("/products/groups?ok=1");
}

export async function saveGroupAction(form: FormData) {
  await assertPermission("products.edit");
  const id = String(form.get("id") ?? "");
  const name_en = String(form.get("name_en") ?? "").trim();
  if (!name_en) redirect("/products/groups?err=name");
  const { error } = await db()
    .from("product_groups")
    .update({ name_en, name_ar: String(form.get("name_ar") ?? "").trim() })
    .eq("id", id);
  if (error) redirect(`/products/groups?err=${encodeURIComponent(friendly(error.message))}`);
  revalidatePath("/products/groups");
  redirect("/products/groups?ok=1");
}

/** Starts the website sync and returns at once; the page shows "Running…" and refreshes itself. */
export async function syncNowAction() {
  const staff = await assertPermission("products.edit");
  const r = await startShopifySync("manual", staff.id);
  if (!r.ok || !r.runId) redirect(`/products?err=${encodeURIComponent(r.error ?? "sync")}`);
  const runId = r.runId;
  after(async () => {
    await finishShopifySync(runId);
  });
  revalidatePath("/products");
  redirect("/products");
}
