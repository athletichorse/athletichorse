/**
 * Portal → website (Shopify Admin GraphQL): prices, Jeddah stock, webhooks.
 * Pure builders are tested; network calls take a fetch implementation.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { API_VERSION, getAccessToken, type OrdersConfig } from "./shopify-orders";

export const gid = (type: "Product" | "ProductVariant" | "InventoryItem" | "Location", id: string | number) =>
  String(id).startsWith("gid://") ? String(id) : `gid://shopify/${type}/${id}`;

let cached: { token: string; until: number; store: string } | null = null;
export async function adminToken(cfg: OrdersConfig, fetchImpl: typeof fetch = fetch) {
  if (cached && cached.store === cfg.store && cached.until > Date.now()) return cached.token;
  const token = await getAccessToken(cfg, fetchImpl);
  cached = { token, until: Date.now() + 20 * 3600_000, store: cfg.store };
  return token;
}

export async function adminGraphql<T>(cfg: OrdersConfig, query: string, variables: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<T> {
  const token = await adminToken(cfg, fetchImpl);
  const res = await fetchImpl(`https://${cfg.store}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": token },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Shopify request failed (${res.status})`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(`Shopify: ${body.errors.map((e) => e.message).join("; ")}`);
  if (!body.data) throw new Error("Shopify returned no data");
  return body.data;
}

// ---------------------------------------------------------------- prices
export type PriceRow = { shopify_product_id: string | number; shopify_variant_id: string | number; price: string; list_price: string };
/**
 * One update per product. While a sale runs (price < list price) the website shows the
 * list price crossed out (compareAtPrice); otherwise compareAtPrice is cleared.
 */
export function buildPriceUpdates(rows: PriceRow[]) {
  const by = new Map<string, { productId: string; variants: { id: string; price: string; compareAtPrice: string | null }[] }>();
  for (const r of rows) {
    const pid = gid("Product", r.shopify_product_id);
    const e = by.get(pid) ?? { productId: pid, variants: [] };
    const onSale = Number(r.price) < Number(r.list_price);
    e.variants.push({ id: gid("ProductVariant", r.shopify_variant_id), price: Number(r.price).toFixed(2), compareAtPrice: onSale ? Number(r.list_price).toFixed(2) : null });
    by.set(pid, e);
  }
  return [...by.values()];
}

export const PRICE_MUTATION = `mutation P($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
}`;

// ---------------------------------------------------------------- stock
export type StockRow = { inventoryItemId: string; qty: number };
/** Set "available" at one Shopify location (absolute numbers; negative stock shows as 0). */
export function buildInventoryInput(rows: StockRow[], locationId: string) {
  return {
    name: "available",
    reason: "correction",
    ignoreCompareQuantity: true,
    quantities: rows.map((r) => ({ inventoryItemId: gid("InventoryItem", r.inventoryItemId), locationId: gid("Location", locationId), quantity: Math.max(0, Math.floor(r.qty)) })),
  };
}
export const STOCK_MUTATION = `mutation S($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) { userErrors { field message } }
}`;
export const INVENTORY_ITEMS_QUERY = `query I($ids: [ID!]!) { nodes(ids: $ids) { ... on ProductVariant { id inventoryItem { id } } } }`;
export const LOCATIONS_QUERY = `query { locations(first: 20) { nodes { id name isActive } } }`;

// ---------------------------------------------------------------- webhooks
export const WEBHOOK_TOPICS = ["ORDERS_CREATE", "ORDERS_UPDATED", "ORDERS_CANCELLED", "PRODUCTS_CREATE", "PRODUCTS_UPDATE"] as const;
export const WEBHOOKS_QUERY = `query { webhookSubscriptions(first: 100) { nodes { id topic endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } } } } }`;
export const WEBHOOK_CREATE = `mutation W($topic: WebhookSubscriptionTopic!, $url: URL!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: { callbackUrl: $url, format: JSON }) { userErrors { field message } }
}`;

/** Shopify signs each webhook with the app's client secret (HMAC-SHA256, base64). */
export function verifyWebhook(rawBody: string, hmacHeader: string | null, secret: string): boolean {
  if (!hmacHeader || !secret) return false;
  const want = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  let got: Buffer;
  try { got = Buffer.from(hmacHeader, "base64"); } catch { return false; }
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Stable quotation id for a website order, so re-syncs never create a second quotation. */
export function quoteClientIdForOrder(orderId: string | number, hash: (s: string) => string): string {
  const h = hash(`web-order-${orderId}`).slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
