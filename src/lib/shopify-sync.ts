import "server-only";
import { db } from "./supabase/admin";
import { chunk, fetchAllProducts, type ShopifyProduct } from "./shopify";
import { fetchOrders, mapOrder, ordersConfig } from "./shopify-orders";

export type SyncResult = { ok: boolean; runId?: string; counts?: Record<string, number>; error?: string };

/**
 * Full website → portal catalogue sync. Runs daily (Vercel Cron) and from "Sync now".
 * Each SQL call is one transaction and every step is an upsert, so re-running is always safe.
 */
export async function runShopifySync(trigger: "manual" | "daily", userId: string | null): Promise<SyncResult> {
  const started = await startShopifySync(trigger, userId);
  if (!started.ok || !started.runId) return started;
  return finishShopifySync(started.runId);
}

/** Records a new run (status "running"). Refuses if another run is in progress. */
export async function startShopifySync(trigger: "manual" | "daily", userId: string | null): Promise<SyncResult> {
  // Runs stuck in "running" for over 10 minutes were cut off (e.g. a timeout): close them.
  await db()
    .from("sync_runs")
    .update({ status: "error", finished_at: new Date().toISOString(), error: "Stopped before finishing (timed out)" })
    .eq("status", "running")
    .in("source", ["shopify", "shopify_orders"])
    .lt("started_at", new Date(Date.now() - 10 * 60_000).toISOString());

  const { data: running } = await db()
    .from("sync_runs")
    .select("id")
    .eq("source", "shopify")
    .eq("status", "running")
    .gte("started_at", new Date(Date.now() - 10 * 60_000).toISOString())
    .limit(1);
  if (running && running.length) return { ok: false, error: "A sync is already running" };

  const { data: run, error: e0 } = await db()
    .from("sync_runs")
    .insert({ source: "shopify", trigger, started_by: userId })
    .select("id")
    .single();
  if (e0 || !run) return { ok: false, error: e0?.message ?? "Could not start sync" };
  return { ok: true, runId: run.id };
}

/** Does the work for a run created by startShopifySync and records the outcome. */
export async function finishShopifySync(runId: string): Promise<SyncResult> {
  const run = { id: runId };
  try {
    const { data: setting } = await db().from("settings").select("value").eq("key", "shopify_store_url").maybeSingle();
    const storeUrl = typeof setting?.value === "string" ? setting.value : "https://athletic-horse.com";
    const products = await keepPortalPrices(await fetchAllProducts(storeUrl));

    const counts = { products_new: 0, products_updated: 0, variants: 0, images: 0, deactivated: 0, website_products: products.length };
    for (const part of chunk(products, 40)) {
      const { data, error } = await db().rpc("sync_shopify_products", { p_products: part });
      if (error) throw new Error(error.message);
      for (const k of ["products_new", "products_updated", "variants", "images"] as const) counts[k] += Number(data?.[k] ?? 0);
    }
    const { data: deactivated, error: e2 } = await db().rpc("deactivate_missing_shopify_products", { p_ids: products.map((p) => p.id) });
    if (e2) throw new Error(e2.message);
    counts.deactivated = Number(deactivated ?? 0);

    await db().from("sync_runs").update({ status: "ok", finished_at: new Date().toISOString(), counts }).eq("id", run.id);
    return { ok: true, runId: run.id, counts };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db().from("sync_runs").update({ status: "error", finished_at: new Date().toISOString(), error: message.slice(0, 1000) }).eq("id", run.id);
    return { ok: false, runId: run.id, error: message };
  }
}

/**
 * While portal prices are pushed to the website, the portal is the source of prices:
 * a website sync keeps the portal's normal price and crossed-out price.
 */
async function keepPortalPrices(products: ShopifyProduct[]): Promise<ShopifyProduct[]> {
  const { data: sw } = await db().from("settings").select("value").eq("key", "shopify_push_prices").maybeSingle();
  if (!(sw?.value === true || sw?.value === "true")) return products;
  const ids = products.flatMap((p) => p.variants.map((v) => v.id));
  const known = new Map<string, { price: string; compare_at_price: string | null }>();
  for (const part of chunk(ids, 500)) {
    const { data } = await db().from("product_variants").select("shopify_variant_id, price, compare_at_price").in("shopify_variant_id", part);
    for (const r of data ?? []) known.set(String(r.shopify_variant_id), { price: String(r.price), compare_at_price: r.compare_at_price === null ? null : String(r.compare_at_price) });
  }
  return products.map((p) => ({ ...p, variants: p.variants.map((v) => { const k = known.get(String(v.id)); return k ? { ...v, ...k } : v; }) }));
}

/** Website orders since a moment (webhooks): same upsert as the full sync, no run log. */
export async function syncOrdersSince(sinceIso: string): Promise<SyncResult> {
  const cfg = ordersConfig();
  if (!cfg) return { ok: false, error: "not_connected" };
  try {
    const orders = (await fetchOrders(cfg, sinceIso)).map(mapOrder);
    for (const part of chunk(orders, 50)) {
      const { error } = await db().rpc("sync_shopify_orders", { p_orders: part });
      if (error) throw new Error(error.message);
    }
    return { ok: true, counts: { fetched: orders.length } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Website orders → portal (daily and "Sync orders now"). Every run is a FULL check of all
 * orders the app may read, so older orders appear as soon as Shopify allows them and nothing
 * missed is left behind. Every order is an upsert, so re-reading is harmless.
 */
export async function runOrdersSync(trigger: "manual" | "daily", userId: string | null): Promise<SyncResult> {
  const cfg = ordersConfig();
  if (!cfg) return { ok: false, error: "not_connected" };
  const { data: running } = await db().from("sync_runs").select("id").eq("source", "shopify_orders").eq("status", "running")
    .gte("started_at", new Date(Date.now() - 10 * 60_000).toISOString()).limit(1);
  if (running?.length) return { ok: false, error: "A sync is already running" };
  const { data: run, error: e0 } = await db().from("sync_runs").insert({ source: "shopify_orders", trigger, started_by: userId }).select("id").single();
  if (e0 || !run) return { ok: false, error: e0?.message ?? "Could not start sync" };
  try {
    const orders = (await fetchOrders(cfg, null)).map(mapOrder);
    const counts = { orders_new: 0, orders_updated: 0, customers_new: 0, stock_moves: 0, fetched: orders.length };
    for (const part of chunk(orders, 50)) {
      const { data, error } = await db().rpc("sync_shopify_orders", { p_orders: part });
      if (error) throw new Error(error.message);
      for (const k of ["orders_new", "orders_updated", "customers_new", "stock_moves"] as const) counts[k] += Number(data?.[k] ?? 0);
    }
    await db().from("sync_runs").update({ status: "ok", finished_at: new Date().toISOString(), counts }).eq("id", run.id);
    return { ok: true, runId: run.id, counts };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db().from("sync_runs").update({ status: "error", finished_at: new Date().toISOString(), error: message.slice(0, 1000) }).eq("id", run.id);
    return { ok: false, runId: run.id, error: message };
  }
}
