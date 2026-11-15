/**
 * Website (Shopify) orders → portal. Uses a Dev Dashboard app on the store with the
 * client-credentials grant (24-hour token fetched per sync). Pure mapping is unit-tested.
 * Env: SHOPIFY_STORE (e.g. sfypqe-qu.myshopify.com), SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET.
 */
export const API_VERSION = "2026-10";

export const ORDERS_QUERY = `query Orders($first: Int!, $after: String, $q: String) {
  orders(first: $first, after: $after, sortKey: UPDATED_AT, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes {
      legacyResourceId name createdAt updatedAt cancelledAt
      displayFinancialStatus displayFulfillmentStatus currencyCode email phone
      customer { firstName lastName defaultEmailAddress { emailAddress } defaultPhoneNumber { phoneNumber } }
      shippingAddress { name phone city }
      subtotalPriceSet { shopMoney { amount } }
      totalTaxSet { shopMoney { amount } }
      totalShippingPriceSet { shopMoney { amount } }
      totalDiscountsSet { shopMoney { amount } }
      currentTotalPriceSet { shopMoney { amount } }
      lineItems(first: 100) {
        nodes {
          id name sku quantity currentQuantity
          variant { legacyResourceId }
          originalUnitPriceSet { shopMoney { amount } }
          discountedTotalSet { shopMoney { amount } }
        }
      }
    }
  }
}`;

type Money = { shopMoney: { amount: string } } | null | undefined;
export type ShopifyOrderNode = {
  legacyResourceId: string; name: string; createdAt: string; updatedAt: string; cancelledAt: string | null;
  displayFinancialStatus: string | null; displayFulfillmentStatus: string | null; currencyCode: string;
  email: string | null; phone: string | null;
  customer: { firstName: string | null; lastName: string | null; defaultEmailAddress: { emailAddress: string } | null; defaultPhoneNumber: { phoneNumber: string } | null } | null;
  shippingAddress: { name: string | null; phone: string | null; city: string | null } | null;
  subtotalPriceSet: Money; totalTaxSet: Money; totalShippingPriceSet: Money; totalDiscountsSet: Money; currentTotalPriceSet: Money;
  lineItems: { nodes: { id: string; name: string; sku: string | null; quantity: number; currentQuantity: number; variant: { legacyResourceId: string } | null; originalUnitPriceSet: Money; discountedTotalSet: Money }[] };
};

const amt = (m: Money) => {
  const a = m?.shopMoney?.amount;
  return a && /^-?\d+(\.\d+)?$/.test(a) ? Number(a).toFixed(2) : "0.00";
};

/** Shopify order → the shape sync_shopify_orders() expects. */
export function mapOrder(o: ShopifyOrderNode) {
  const c = o.customer;
  const name = [c?.firstName, c?.lastName].filter(Boolean).join(" ") || o.shippingAddress?.name || "";
  return {
    id: o.legacyResourceId,
    name: o.name,
    created_at: o.createdAt,
    updated_at: o.updatedAt,
    cancelled_at: o.cancelledAt ?? "",
    financial_status: (o.displayFinancialStatus ?? "").toLowerCase(),
    fulfillment_status: (o.displayFulfillmentStatus ?? "").toLowerCase(),
    currency: o.currencyCode,
    customer_name: name,
    phone: c?.defaultPhoneNumber?.phoneNumber || o.shippingAddress?.phone || o.phone || "",
    email: c?.defaultEmailAddress?.emailAddress || o.email || "",
    city: o.shippingAddress?.city ?? "",
    subtotal: amt(o.subtotalPriceSet),
    shipping: amt(o.totalShippingPriceSet),
    discounts: amt(o.totalDiscountsSet),
    tax: amt(o.totalTaxSet),
    total: amt(o.currentTotalPriceSet),
    lines: o.lineItems.nodes.map((l) => ({
      id: l.id,
      variant_id: l.variant?.legacyResourceId ?? "",
      name: l.name,
      sku: l.sku ?? "",
      qty: l.quantity,
      current_qty: l.currentQuantity,
      unit_price: amt(l.originalUnitPriceSet),
      line_total: amt(l.discountedTotalSet),
    })),
  };
}

export type OrdersConfig = { store: string; clientId: string; clientSecret: string };

export function ordersConfig(env: Record<string, string | undefined> = process.env): OrdersConfig | null {
  const store = (env.SHOPIFY_STORE ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const clientId = (env.SHOPIFY_CLIENT_ID ?? "").trim();
  const clientSecret = (env.SHOPIFY_CLIENT_SECRET ?? "").trim();
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(store) || !clientId || !clientSecret) return null;
  return { store, clientId, clientSecret };
}

export async function getAccessToken(cfg: OrdersConfig, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(`https://${cfg.store}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: cfg.clientId, client_secret: cfg.clientSecret }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Shopify refused the app credentials (${res.status}). Check the app is installed and the ID/secret in Vercel.`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("Shopify did not return an access token");
  return body.access_token;
}

/** All orders updated since `sinceIso` (or all orders when null). */
export async function fetchOrders(cfg: OrdersConfig, sinceIso: string | null, fetchImpl: typeof fetch = fetch): Promise<ShopifyOrderNode[]> {
  const token = await getAccessToken(cfg, fetchImpl);
  const out: ShopifyOrderNode[] = [];
  let after: string | null = null;
  for (let page = 0; page < 200; page++) {
    const res = await fetchImpl(`https://${cfg.store}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-shopify-access-token": token },
      body: JSON.stringify({ query: ORDERS_QUERY, variables: { first: 50, after, q: sinceIso ? `updated_at:>'${sinceIso}'` : null } }),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Shopify orders request failed (${res.status})`);
    const body = (await res.json()) as { data?: { orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyOrderNode[] } }; errors?: { message: string }[] };
    if (body.errors?.length) throw new Error(`Shopify: ${body.errors.map((e) => e.message).join("; ")}`);
    const conn = body.data?.orders;
    if (!conn) throw new Error("Shopify returned no orders data");
    out.push(...conn.nodes);
    if (!conn.pageInfo.hasNextPage) return out;
    after = conn.pageInfo.endCursor;
  }
  throw new Error("Too many order pages — stopped for safety");
}
