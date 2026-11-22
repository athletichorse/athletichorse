/**
 * Change a website order on the website itself (Shopify Admin GraphQL):
 *   ship     — mark fulfilled with the shipping company + waybill; Shopify emails the customer the tracking
 *   paid     — mark as paid (cash on delivery received)
 *   cancel   — cancel on the website and put the items back in stock (no refund: refunds stay on Shopify)
 * Pure builders are tested; the network calls take a fetch implementation.
 */
import { adminGraphql } from "./shopify-admin";
import type { OrdersConfig } from "./shopify-orders";

export const WEBSITE_ACTIONS = ["ship", "paid", "cancel"] as const;
export type WebsiteAction = (typeof WEBSITE_ACTIONS)[number];
export type WebsiteResult = { ok: true } | { ok: false; error: string };

export const orderGid = (id: string | number) => (String(id).startsWith("gid://") ? String(id) : `gid://shopify/Order/${id}`);

export const FULFILLMENT_ORDERS_QUERY = `query FO($id: ID!) {
  order(id: $id) { id fulfillmentOrders(first: 20) { nodes { id status supportedActions { action } } } }
}`;
export const FULFILL_MUTATION = `mutation F($fulfillment: FulfillmentInput!) {
  fulfillmentCreate(fulfillment: $fulfillment) { fulfillment { id status } userErrors { field message } }
}`;
export const PAID_MUTATION = `mutation P($input: OrderMarkAsPaidInput!) {
  orderMarkAsPaid(input: $input) { order { id displayFinancialStatus } userErrors { field message } }
}`;
export const CANCEL_MUTATION = `mutation C($orderId: ID!, $reason: OrderCancelReason!, $restock: Boolean!, $notifyCustomer: Boolean, $staffNote: String) {
  orderCancel(orderId: $orderId, reason: $reason, restock: $restock, notifyCustomer: $notifyCustomer, staffNote: $staffNote) {
    job { id done } orderCancelUserErrors { field message code }
  }
}`;

type FONode = { id: string; status: string; supportedActions: { action: string }[] };

/** Fulfillment orders that can still be shipped. */
export function shippable(nodes: FONode[]) {
  return nodes.filter((n) => n.supportedActions.some((a) => a.action === "CREATE_FULFILLMENT")).map((n) => n.id);
}

/** One fulfillment per fulfillment order (each sits at one location), all remaining items. */
export function buildFulfillment(foId: string, company: string, number: string) {
  const trackingInfo: Record<string, string> = {};
  if (company.trim()) trackingInfo.company = company.trim().slice(0, 60);
  if (number.trim()) trackingInfo.number = number.trim().slice(0, 60);
  return { lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: foId }], notifyCustomer: true, ...(Object.keys(trackingInfo).length ? { trackingInfo } : {}) };
}

export function buildCancel(orderId: string | number, note: string) {
  return { orderId: orderGid(orderId), reason: "CUSTOMER", restock: true, notifyCustomer: false, staffNote: note.slice(0, 255) || null };
}

const errs = (list?: { message: string }[] | null) => (list?.length ? list.map((e) => e.message).join("; ") : null);

export async function shipOnWebsite(cfg: OrdersConfig, shopifyOrderId: string | number, company: string, number: string, fetchImpl: typeof fetch = fetch): Promise<WebsiteResult> {
  const d = await adminGraphql<{ order: { fulfillmentOrders: { nodes: FONode[] } } | null }>(cfg, FULFILLMENT_ORDERS_QUERY, { id: orderGid(shopifyOrderId) }, fetchImpl);
  if (!d.order) return { ok: false, error: "order_not_found" };
  const ids = shippable(d.order.fulfillmentOrders.nodes);
  if (!ids.length) return { ok: false, error: "nothing_to_ship" };
  for (const id of ids) {
    const r = await adminGraphql<{ fulfillmentCreate: { userErrors: { message: string }[] } }>(cfg, FULFILL_MUTATION, { fulfillment: buildFulfillment(id, company, number) }, fetchImpl);
    const e = errs(r.fulfillmentCreate.userErrors);
    if (e) return { ok: false, error: e };
  }
  return { ok: true };
}

export async function markPaidOnWebsite(cfg: OrdersConfig, shopifyOrderId: string | number, fetchImpl: typeof fetch = fetch): Promise<WebsiteResult> {
  const r = await adminGraphql<{ orderMarkAsPaid: { userErrors: { message: string }[] } }>(cfg, PAID_MUTATION, { input: { id: orderGid(shopifyOrderId) } }, fetchImpl);
  const e = errs(r.orderMarkAsPaid.userErrors);
  return e ? { ok: false, error: e } : { ok: true };
}

export async function cancelOnWebsite(cfg: OrdersConfig, shopifyOrderId: string | number, note: string, fetchImpl: typeof fetch = fetch): Promise<WebsiteResult> {
  const r = await adminGraphql<{ orderCancel: { orderCancelUserErrors: { message: string }[] } }>(cfg, CANCEL_MUTATION, buildCancel(shopifyOrderId, note), fetchImpl);
  const e = errs(r.orderCancel.orderCancelUserErrors);
  return e ? { ok: false, error: e } : { ok: true };
}
