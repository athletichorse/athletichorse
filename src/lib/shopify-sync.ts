import "server-only";
import { db } from "./supabase/admin";
import { chunk, fetchAllProducts } from "./shopify";

export type SyncResult = { ok: boolean; runId?: string; counts?: Record<string, number>; error?: string };

/**
 * Full website → portal catalogue sync. Runs daily (Vercel Cron) and from "Sync now".
 * Each SQL call is one transaction and every step is an upsert, so re-running is always safe.
 */
export async function runShopifySync(trigger: "manual" | "daily", userId: string | null): Promise<SyncResult> {
  // Don't start a second sync while one is running (started in the last 10 minutes).
  const { data: running } = await db()
    .from("sync_runs")
    .select("id")
    .eq("status", "running")
    .gte("started_at", new Date(Date.now() - 10 * 60_000).toISOString())
    .limit(1);
  if (running && running.length) return { ok: false, error: "A sync is already running" };

  const { data: run, error: e0 } = await db()
    .from("sync_runs")
    .insert({ trigger, started_by: userId })
    .select("id")
    .single();
  if (e0 || !run) return { ok: false, error: e0?.message ?? "Could not start sync" };

  try {
    const { data: setting } = await db().from("settings").select("value").eq("key", "shopify_store_url").maybeSingle();
    const storeUrl = typeof setting?.value === "string" ? setting.value : "https://athletic-horse.com";
    const products = await fetchAllProducts(storeUrl);

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
