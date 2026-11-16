"use server";

import { saleWindow, type PriceRow } from "@/lib/product-prices";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission, requireStaff } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { formatDecimal, toHalalas } from "@/lib/money";
import { after } from "next/server";
import { finishShopifySync, startShopifySync } from "@/lib/shopify-sync";
import { pushPrices, webSwitches } from "@/lib/website-push";

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
  const sw = fromWebsite ? await webSwitches() : null;
  const webPrices = !!sw?.push_prices;
  for (const v of variants ?? []) {
    const sku = String(form.get(`sku:${v.id}`) ?? "").trim() || null;
    if (sku && !CODE.test(sku)) return back("sku");
    let cost: string | null, price: string | null;
    try {
      cost = money(form.get(`cost:${v.id}`));
      price = v.shopify_variant_id === null || webPrices ? money(form.get(`price:${v.id}`)) : null;
    } catch {
      return back("money");
    }
    const row: Record<string, unknown> = { sku, active: form.get(`active:${v.id}`) === "on" };
    // extras: wholesale price, reorder level, sale price for a period (redirects stay outside try/catch)
    let wholesale: string | null = null, salePrice: string | null = null;
    try {
      wholesale = money(form.get(`wholesale:${v.id}`));
      salePrice = money(form.get(`sale:${v.id}`));
    } catch {
      return back("money");
    }
    if (form.has(`wholesale:${v.id}`)) row.wholesale_price = wholesale;
    if (form.has(`reorder:${v.id}`)) {
      const r = String(form.get(`reorder:${v.id}`) ?? "").trim();
      if (r && !/^\d{1,9}(\.\d{1,3})?$/.test(r)) return back("money");
      row.reorder_level = r || null;
    }
    if (staff.perms.has("products.sale_prices") && form.has(`sale:${v.id}`)) {
      const sp = saleWindow(salePrice, String(form.get(`sale_from:${v.id}`) ?? ""), String(form.get(`sale_to:${v.id}`) ?? ""));
      if (!sp) return back("sale");
      Object.assign(row, sp);
    }
    if (canCost && form.has(`cost:${v.id}`)) row.cost = cost;
    if ((v.shopify_variant_id === null || webPrices) && price !== null) row.price = price;
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
  await audit(staff.id, "product.update", "product", id, { variants: (variants ?? []).length });
  if (webPrices) {
    const vids = (variants ?? []).map((v) => v.id);
    after(() => pushPrices(vids));
  }
  revalidatePath("/products");
  back();
}

export async function createProductAction(form: FormData) {
  const staff = await requireStaff();
  if (!staff.perms.has("products.add") && !staff.perms.has("products.edit")) redirect("/forbidden");
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
  await audit(staff.id, "product.create", "product", created.id, { sku });
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
  if (r.ok) await audit(staff.id, "products.sync", "sync_run", r.runId ?? null);
  if (!r.ok || !r.runId) redirect(`/products?err=${encodeURIComponent(r.error ?? "sync")}`);
  const runId = r.runId;
  after(async () => {
    await finishShopifySync(runId);
  });
  revalidatePath("/products");
  redirect("/products?synced=1");
}

// ---------------------------------------------------------------- names & prices file
export type PricePreview = {
  sku: string; found: boolean; onWebsite: boolean; name: string;
  changes: { field: "name_en" | "name_ar" | "price" | "wholesale" | "cost"; old: string; new: string }[];
};

/** Old → new for every row of a names & prices file (nothing is saved). */
export async function previewPricesAction(rows: PriceRow[]): Promise<{ ok: true; items: PricePreview[] } | { ok: false; error: string }> {
  const s = await requireStaff();
  if (!s.perms.has("products.edit")) return { ok: false, error: "forbidden" };
  const list = (Array.isArray(rows) ? rows : []).slice(0, 20_000);
  const canCost = s.perms.has("products.view_cost");
  const found = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < list.length; i += 500) {
    const skus = list.slice(i, i + 500).map((r) => String(r.sku));
    const { data } = await db().from("variant_prices").select("sku, name_en, name_ar, price, wholesale_price, cost, on_website").in("sku", skus);
    for (const d of data ?? []) found.set(String(d.sku), d);
  }
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const money2 = (v: unknown) => { try { return v === null || v === undefined || v === "" ? "" : formatDecimal(toHalalas(String(v))); } catch { return str(v); } };
  const items: PricePreview[] = list.map((r) => {
    const d = found.get(String(r.sku));
    if (!d) return { sku: r.sku, found: false, onWebsite: false, name: "", changes: [] };
    const web = Boolean(d.on_website);
    const changes: PricePreview["changes"] = [];
    if (r.name_en && !web && r.name_en !== str(d.name_en)) changes.push({ field: "name_en", old: str(d.name_en), new: r.name_en });
    if (r.name_ar && r.name_ar !== str(d.name_ar)) changes.push({ field: "name_ar", old: str(d.name_ar), new: r.name_ar });
    if (r.price && !web && r.price !== money2(d.price)) changes.push({ field: "price", old: money2(d.price), new: r.price });
    if (r.wholesale && r.wholesale !== money2(d.wholesale_price)) changes.push({ field: "wholesale", old: money2(d.wholesale_price), new: r.wholesale });
    if (canCost && r.cost && r.cost !== money2(d.cost)) changes.push({ field: "cost", old: money2(d.cost), new: r.cost });
    return { sku: r.sku, found: true, onWebsite: web, name: str(d.name_ar) || str(d.name_en), changes };
  });
  return { ok: true, items };
}

/** Saves a names & prices file (only changed fields; website prices are kept). */
export async function applyPricesAction(rows: PriceRow[]): Promise<{ ok: true; updated: number; notFound: number; websiteKept: number } | { ok: false; error: string }> {
  const s = await requireStaff();
  if (!s.perms.has("products.edit")) return { ok: false, error: "forbidden" };
  const list = (Array.isArray(rows) ? rows : []).slice(0, 20_000);
  let updated = 0, notFound = 0, websiteKept = 0;
  for (let i = 0; i < list.length; i += 500) {
    const { data, error } = await db().rpc("update_names_prices", { p_rows: list.slice(i, i + 500), p_user: s.id, p_can_cost: s.perms.has("products.view_cost") });
    if (error) return { ok: false, error: error.message };
    updated += Number(data?.updated ?? 0); notFound += Number(data?.not_found ?? 0); websiteKept += Number(data?.website_price_kept ?? 0);
  }
  // portal prices go to the website: website items take the file's price too
  if ((await webSwitches()).push_prices) {
    const changed: string[] = [];
    for (let i = 0; i < list.length; i += 500) {
      const { data, error } = await db().rpc("update_web_prices", { p_rows: list.slice(i, i + 500), p_user: s.id });
      if (error) return { ok: false, error: error.message };
      changed.push(...((data ?? []) as string[]));
    }
    websiteKept = Math.max(0, websiteKept - changed.length);
    updated += changed.length;
    if (changed.length) after(() => pushPrices(changed));
  }
  revalidatePath("/products");
  return { ok: true, updated, notFound, websiteKept };
}
