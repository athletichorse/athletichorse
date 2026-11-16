import "server-only";
import { createHash } from "node:crypto";
import { db } from "./supabase/admin";
import { ordersConfig } from "./shopify-orders";
import {
  adminGraphql, buildInventoryInput, buildPriceUpdates, INVENTORY_ITEMS_QUERY, LOCATIONS_QUERY, PRICE_MUTATION,
  quoteClientIdForOrder, STOCK_MUTATION, WEBHOOK_CREATE, WEBHOOK_TOPICS, WEBHOOKS_QUERY, gid,
} from "./shopify-admin";
import { chunk } from "./shopify";

export type WebSwitches = { push_prices: boolean; push_stock: boolean; orders_to_quotes: boolean; location: string | null };
const KEYS = { push_prices: "shopify_push_prices", push_stock: "shopify_push_stock", orders_to_quotes: "web_orders_to_quotes" } as const;

export async function webSwitches(): Promise<WebSwitches> {
  const { data } = await db().from("settings").select("key, value").in("key", [...Object.values(KEYS), "shopify_location_id"]);
  const on = (k: string) => { const v = data?.find((r) => r.key === k)?.value; return v === true || v === "true"; };
  const loc = data?.find((r) => r.key === "shopify_location_id")?.value;
  return { push_prices: on(KEYS.push_prices), push_stock: on(KEYS.push_stock), orders_to_quotes: on(KEYS.orders_to_quotes), location: typeof loc === "string" && loc ? loc : null };
}

async function note(kind: string, ok: boolean, detail: Record<string, unknown>) {
  await db().from("settings").upsert({ key: `shopify_push_last_${kind}`, value: { at: new Date().toISOString(), ok, ...detail } });
}

type Row = { variant_id: string; shopify_product_id: number; shopify_variant_id: number; price: string; list_price: string; qty: string };
async function rows(variantIds: string[] | null): Promise<Row[]> {
  const { data, error } = await db().rpc("web_push_rows", { p_variant_ids: variantIds });
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
}

/** Sends today's prices (sale prices included) for these items, or every website item. */
export async function pushPrices(variantIds: string[] | null): Promise<{ ok: boolean; sent?: number; error?: string }> {
  const cfg = ordersConfig();
  const sw = await webSwitches();
  if (!cfg || !sw.push_prices) return { ok: false, error: "off" };
  try {
    const list = await rows(variantIds);
    const errors: string[] = [];
    for (const u of buildPriceUpdates(list)) {
      const r = await adminGraphql<{ productVariantsBulkUpdate: { userErrors: { message: string }[] } }>(cfg, PRICE_MUTATION, u);
      errors.push(...r.productVariantsBulkUpdate.userErrors.map((e) => e.message));
    }
    await note("prices", errors.length === 0, { sent: list.length, error: errors.slice(0, 3).join("; ") || null });
    return { ok: errors.length === 0, sent: list.length, error: errors[0] };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await note("prices", false, { error });
    return { ok: false, error };
  }
}

/** The Shopify location the website stock goes to: the one chosen, else the first active one. */
async function shopifyLocation(cfg: NonNullable<ReturnType<typeof ordersConfig>>, chosen: string | null) {
  if (chosen) return chosen;
  const r = await adminGraphql<{ locations: { nodes: { id: string; isActive: boolean }[] } }>(cfg, LOCATIONS_QUERY, {});
  const loc = r.locations.nodes.find((l) => l.isActive)?.id;
  if (!loc) throw new Error("No active location on the website");
  return loc;
}

/** Sends the website stock location's quantities for these items, or every website item. */
export async function pushStock(variantIds: string[] | null): Promise<{ ok: boolean; sent?: number; error?: string }> {
  const cfg = ordersConfig();
  const sw = await webSwitches();
  if (!cfg || !sw.push_stock) return { ok: false, error: "off" };
  try {
    const list = await rows(variantIds);
    const location = await shopifyLocation(cfg, sw.location);
    const errors: string[] = [];
    let sent = 0;
    for (const part of chunk(list, 100)) {
      const r = await adminGraphql<{ nodes: ({ id: string; inventoryItem: { id: string } } | null)[] }>(cfg, INVENTORY_ITEMS_QUERY, { ids: part.map((x) => gid("ProductVariant", x.shopify_variant_id)) });
      const item = new Map(r.nodes.filter(Boolean).map((n) => [n!.id, n!.inventoryItem.id]));
      const stock = part.flatMap((x) => { const id = item.get(gid("ProductVariant", x.shopify_variant_id)); return id ? [{ inventoryItemId: id, qty: Number(x.qty) }] : []; });
      if (!stock.length) continue;
      const s = await adminGraphql<{ inventorySetQuantities: { userErrors: { message: string }[] } }>(cfg, STOCK_MUTATION, { input: buildInventoryInput(stock, location) });
      errors.push(...s.inventorySetQuantities.userErrors.map((e) => e.message));
      sent += stock.length;
    }
    await note("stock", errors.length === 0, { sent, error: errors.slice(0, 3).join("; ") || null });
    return { ok: errors.length === 0, sent, error: errors[0] };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await note("stock", false, { error });
    return { ok: false, error };
  }
}

/** After a stock change: push only if some of these items sit at the website stock location. */
export async function pushStockIfWebsite(locationIds: (string | null | undefined)[], variantIds: string[]) {
  if (!variantIds.length || !(await webSwitches()).push_stock) return;
  const { data } = await db().from("settings").select("value").eq("key", "website_stock_location").maybeSingle();
  if (!data?.value || !locationIds.includes(String(data.value))) return;
  await pushStock(variantIds);
}

/** Registers the website → portal webhooks (orders, products) at this site's address. */
export async function connectWebhooks(baseUrl: string): Promise<{ ok: boolean; added: number; error?: string }> {
  const cfg = ordersConfig();
  if (!cfg) return { ok: false, added: 0, error: "not_connected" };
  const url = `${baseUrl.replace(/\/$/, "")}/api/shopify/webhook`;
  try {
    const have = await adminGraphql<{ webhookSubscriptions: { nodes: { topic: string; endpoint: { callbackUrl?: string } }[] } }>(cfg, WEBHOOKS_QUERY, {});
    let added = 0;
    for (const topic of WEBHOOK_TOPICS) {
      if (have.webhookSubscriptions.nodes.some((n) => n.topic === topic && n.endpoint.callbackUrl === url)) continue;
      const r = await adminGraphql<{ webhookSubscriptionCreate: { userErrors: { message: string }[] } }>(cfg, WEBHOOK_CREATE, { topic, url });
      if (r.webhookSubscriptionCreate.userErrors.length) throw new Error(r.webhookSubscriptionCreate.userErrors[0].message);
      added++;
    }
    await note("webhooks", true, { added, url });
    return { ok: true, added };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await note("webhooks", false, { error });
    return { ok: false, added: 0, error };
  }
}

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

/**
 * Website orders → quotations to collect at the till (switch on). Only open, unfulfilled
 * orders placed after the switch was turned on; one quotation per order, ever.
 */
export async function ordersToQuotations(): Promise<{ made: number }> {
  const sw = await webSwitches();
  if (!sw.orders_to_quotes) return { made: 0 };
  const { data: settings } = await db().from("settings").select("key, value").in("key", ["web_orders_quotes_from", "website_stock_location"]);
  const from = settings?.find((r) => r.key === "web_orders_quotes_from")?.value;
  const loc = settings?.find((r) => r.key === "website_stock_location")?.value;
  if (typeof from !== "string" || typeof loc !== "string") return { made: 0 };
  const { data: owner } = await db().from("profiles").select("id").eq("role", "owner").eq("active", true).order("created_at").limit(1).maybeSingle();
  if (!owner) return { made: 0 };
  const { data: orders } = await db().from("web_orders")
    .select("id, shopify_order_id, customer_id, cancelled_at, fulfillment_status, web_order_lines(variant_id, qty, current_qty, unit_price, line_total)")
    .is("quotation_id", null).is("cancelled_at", null).gte("created_at", from).limit(200);
  let made = 0;
  for (const o of orders ?? []) {
    if (/^fulfilled$/i.test(String(o.fulfillment_status))) continue;
    const lines = ((o.web_order_lines ?? []) as { variant_id: string | null; qty: string; current_qty: string; unit_price: string; line_total: string }[])
      .filter((l) => l.variant_id && Number(l.current_qty) > 0)
      .map((l) => {
        const qty = Number(l.current_qty), unit = Number(l.unit_price), ordered = Number(l.qty) || qty;
        // the website discount for the original quantity, scaled to what is still on the order
        const discount = Math.max(0, Math.round(((unit * ordered - Number(l.line_total)) * qty / ordered) * 100) / 100);
        return { variant_id: l.variant_id, qty, unit_price: unit, discount: Math.min(discount, unit * qty) };
      });
    if (!lines.length) continue;
    const { data, error } = await db().rpc("save_quotation", {
      p: { client_id: quoteClientIdForOrder(o.shopify_order_id, md5), location_id: loc, user_id: owner.id, customer_id: o.customer_id ?? "", lines },
    });
    if (error || !data?.quotation_id) continue;
    await db().from("web_orders").update({ quotation_id: data.quotation_id }).eq("id", o.id);
    made++;
  }
  return { made };
}

/** After a sale or return: push the receipt's items if it was at the website stock location. */
export async function pushStockForInvoice(invoiceId: string, locationId: string) {
  if (!(await webSwitches()).push_stock) return;
  const { data } = await db().from("invoice_lines").select("variant_id").eq("invoice_id", invoiceId);
  await pushStockIfWebsite([locationId], [...new Set((data ?? []).map((l) => l.variant_id).filter(Boolean) as string[])]);
}
