import { describe, expect, it } from "vitest";
import { fetchOrders, mapOrder, ordersConfig, type ShopifyOrderNode } from "@/lib/shopify-orders";

const node = (id: string, extra: Partial<ShopifyOrderNode> = {}): ShopifyOrderNode => ({
  legacyResourceId: id, name: `#${id}`, createdAt: "2026-11-15T07:05:02Z", updatedAt: "2026-11-15T07:05:02Z", cancelledAt: null,
  displayFinancialStatus: "PAID", displayFulfillmentStatus: "FULFILLED", currencyCode: "SAR", email: null, phone: null,
  customer: { firstName: "Test", lastName: "Buyer", defaultEmailAddress: { emailAddress: "t@example.com" }, defaultPhoneNumber: null },
  shippingAddress: { name: "Test Buyer", phone: "0501234567", city: "Jeddah" },
  subtotalPriceSet: { shopMoney: { amount: "70.0" } }, totalTaxSet: { shopMoney: { amount: "9.13" } },
  totalShippingPriceSet: { shopMoney: { amount: "20.0" } }, totalDiscountsSet: { shopMoney: { amount: "0.0" } },
  currentTotalPriceSet: { shopMoney: { amount: "90.0" } },
  lineItems: { nodes: [{ id: "gid://shopify/LineItem/1", name: "Bands", sku: "367015", quantity: 1, currentQuantity: 1, variant: { legacyResourceId: "49677123453178" }, originalUnitPriceSet: { shopMoney: { amount: "70.0" } }, discountedTotalSet: { shopMoney: { amount: "70.0" } } }] },
  ...extra,
});

describe("mapOrder", () => {
  it("maps totals with 2 decimals, statuses lower-case, phone from the shipping address", () => {
    const m = mapOrder(node("1"));
    expect(m).toMatchObject({ id: "1", name: "#1", total: "90.00", tax: "9.13", shipping: "20.00", financial_status: "paid", phone: "0501234567", customer_name: "Test Buyer", city: "Jeddah" });
    expect(m.lines[0]).toMatchObject({ variant_id: "49677123453178", qty: 1, current_qty: 1, unit_price: "70.00", line_total: "70.00" });
  });
  it("prefers the customer's own phone", () => {
    const m = mapOrder(node("2", { customer: { firstName: "A", lastName: null, defaultEmailAddress: null, defaultPhoneNumber: { phoneNumber: "+966549918113" } } }));
    expect(m.phone).toBe("+966549918113");
  });
  it("keeps cancellations and missing variants", () => {
    const m = mapOrder(node("3", { cancelledAt: "2026-11-14T10:51:44Z", lineItems: { nodes: [{ id: "x", name: "Gone", sku: null, quantity: 1, currentQuantity: 0, variant: null, originalUnitPriceSet: null, discountedTotalSet: null }] } }));
    expect(m.cancelled_at).toBe("2026-11-14T10:51:44Z");
    expect(m.lines[0]).toMatchObject({ variant_id: "", current_qty: 0, unit_price: "0.00" });
  });
});

describe("ordersConfig", () => {
  it("needs the store, client id and secret", () => {
    expect(ordersConfig({})).toBeNull();
    expect(ordersConfig({ SHOPIFY_STORE: "athletic-horse.com", SHOPIFY_CLIENT_ID: "a", SHOPIFY_CLIENT_SECRET: "b" })).toBeNull();
    expect(ordersConfig({ SHOPIFY_STORE: "https://sfypqe-qu.myshopify.com/", SHOPIFY_CLIENT_ID: "a", SHOPIFY_CLIENT_SECRET: "b" })).toEqual({ store: "sfypqe-qu.myshopify.com", clientId: "a", clientSecret: "b" });
  });
});

describe("fetchOrders", () => {
  const cfg = { store: "sfypqe-qu.myshopify.com", clientId: "id", clientSecret: "secret" };
  it("gets a token, then follows pages", async () => {
    const calls: string[] = [];
    const fake = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push(u);
      if (u.endsWith("/admin/oauth/access_token")) {
        expect(String(init?.body)).toContain("grant_type=client_credentials");
        return Response.json({ access_token: "shpat_x", expires_in: 86399 });
      }
      const body = JSON.parse(String(init?.body));
      expect((init?.headers as Record<string, string>)["x-shopify-access-token"]).toBe("shpat_x");
      const second = body.variables.after === "c1";
      return Response.json({ data: { orders: { pageInfo: { hasNextPage: !second, endCursor: second ? null : "c1" }, nodes: [node(second ? "2" : "1")] } } });
    }) as typeof fetch;
    const out = await fetchOrders(cfg, "2026-11-01T00:00:00Z", fake);
    expect(out.map((o) => o.legacyResourceId)).toEqual(["1", "2"]);
    expect(calls.filter((c) => c.includes("graphql.json"))).toHaveLength(2);
  });
  it("explains a refused app", async () => {
    const fake = (async () => new Response("no", { status: 401 })) as typeof fetch;
    await expect(fetchOrders(cfg, null, fake)).rejects.toThrow(/refused the app credentials/);
  });
});
