import { describe, expect, it } from "vitest";
import { buildCancel, buildFulfillment, cancelOnWebsite, markPaidOnWebsite, orderGid, shipOnWebsite, shippable } from "@/lib/website-orders";

const cfg = { store: "x.myshopify.com", clientId: "id", clientSecret: "s" };
function fakeFetch(answers: unknown[]) {
  const sent: { query: string; variables: Record<string, unknown> }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    if (String(url).includes("oauth")) return new Response(JSON.stringify({ access_token: "t", expires_in: 86399 }));
    sent.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ data: answers.shift() }));
  }) as unknown as typeof fetch;
  return { f, sent };
}

describe("website orders", () => {
  it("builds ids, fulfillment and cancel inputs", () => {
    expect(orderGid(123)).toBe("gid://shopify/Order/123");
    expect(orderGid("gid://shopify/Order/5")).toBe("gid://shopify/Order/5");
    expect(buildFulfillment("FO1", " Aramex ", "WB9")).toEqual({ lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: "FO1" }], notifyCustomer: true, trackingInfo: { company: "Aramex", number: "WB9" } });
    expect(buildFulfillment("FO1", "", "")).not.toHaveProperty("trackingInfo");
    expect(buildCancel(7, "note")).toMatchObject({ orderId: "gid://shopify/Order/7", restock: true, reason: "CUSTOMER", notifyCustomer: false });
  });

  it("ships only what can still be shipped", () => {
    expect(shippable([
      { id: "a", status: "OPEN", supportedActions: [{ action: "CREATE_FULFILLMENT" }] },
      { id: "b", status: "CLOSED", supportedActions: [] },
    ])).toEqual(["a"]);
  });

  it("ship: one fulfillment per open fulfillment order, with tracking", async () => {
    const { f, sent } = fakeFetch([
      { order: { fulfillmentOrders: { nodes: [{ id: "FO1", status: "OPEN", supportedActions: [{ action: "CREATE_FULFILLMENT" }] }] } } },
      { fulfillmentCreate: { userErrors: [] } },
    ]);
    expect(await shipOnWebsite(cfg, 55, "SMSA", "123", f)).toEqual({ ok: true });
    expect(sent[1].variables.fulfillment).toMatchObject({ trackingInfo: { company: "SMSA", number: "123" }, notifyCustomer: true });
  });

  it("ship: says when nothing is left", async () => {
    const { f } = fakeFetch([{ order: { fulfillmentOrders: { nodes: [] } } }]);
    expect(await shipOnWebsite(cfg, 56, "SMSA", "1", f)).toEqual({ ok: false, error: "nothing_to_ship" });
  });

  it("paid and cancel pass on the website's errors", async () => {
    const a = fakeFetch([{ orderMarkAsPaid: { userErrors: [{ message: "Already paid" }] } }]);
    expect(await markPaidOnWebsite(cfg, 1, a.f)).toEqual({ ok: false, error: "Already paid" });
    const b = fakeFetch([{ orderCancel: { orderCancelUserErrors: [] } }]);
    expect(await cancelOnWebsite(cfg, 1, "n", b.f)).toEqual({ ok: true });
  });
});
