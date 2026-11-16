import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildInventoryInput, buildPriceUpdates, gid, quoteClientIdForOrder, verifyWebhook } from "@/lib/shopify-admin";

describe("portal → website", () => {
  it("prices: one update per product; sale shows the list price crossed out", () => {
    const u = buildPriceUpdates([
      { shopify_product_id: 1, shopify_variant_id: 11, price: "90", list_price: "100" },
      { shopify_product_id: 1, shopify_variant_id: 12, price: "100", list_price: "100" },
      { shopify_product_id: 2, shopify_variant_id: 21, price: "5.5", list_price: "5.5" },
    ]);
    expect(u).toEqual([
      { productId: "gid://shopify/Product/1", variants: [{ id: "gid://shopify/ProductVariant/11", price: "90.00", compareAtPrice: "100.00" }, { id: "gid://shopify/ProductVariant/12", price: "100.00", compareAtPrice: null }] },
      { productId: "gid://shopify/Product/2", variants: [{ id: "gid://shopify/ProductVariant/21", price: "5.50", compareAtPrice: null }] },
    ]);
  });
  it("stock: absolute quantities at the website location, never below zero", () => {
    expect(buildInventoryInput([{ inventoryItemId: "7", qty: 4.9 }, { inventoryItemId: "gid://shopify/InventoryItem/8", qty: -2 }], "55")).toEqual({
      name: "available", reason: "correction", ignoreCompareQuantity: true,
      quantities: [{ inventoryItemId: "gid://shopify/InventoryItem/7", locationId: "gid://shopify/Location/55", quantity: 4 }, { inventoryItemId: "gid://shopify/InventoryItem/8", locationId: "gid://shopify/Location/55", quantity: 0 }],
    });
    expect(gid("Product", "gid://shopify/Product/9")).toBe("gid://shopify/Product/9");
  });
  it("webhooks: only Shopify's signature is accepted", () => {
    const body = '{"id":1}';
    const sig = createHmac("sha256", "s3cret").update(body).digest("base64");
    expect(verifyWebhook(body, sig, "s3cret")).toBe(true);
    expect(verifyWebhook(body + " ", sig, "s3cret")).toBe(false);
    expect(verifyWebhook(body, sig, "other")).toBe(false);
    expect(verifyWebhook(body, null, "s3cret")).toBe(false);
  });
  it("a website order always maps to the same quotation id", () => {
    const md5 = (s: string) => createHash("md5").update(s).digest("hex");
    const a = quoteClientIdForOrder(123, md5);
    expect(a).toBe(quoteClientIdForOrder("123", md5));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(quoteClientIdForOrder(124, md5));
  });
});

describe("Shopify busy (Throttled)", () => {
  it("waits and tries again, then gives up after a few tries", async () => {
    const { adminGraphql } = await import("@/lib/shopify-admin");
    const cfg = { store: "t1.myshopify.com", clientId: "id", clientSecret: "s" };
    let calls = 0;
    const ok = async (url: string | URL | Request) => {
      if (String(url).includes("oauth")) return new Response(JSON.stringify({ access_token: "tok" }));
      calls++;
      return new Response(JSON.stringify(calls < 3 ? { errors: [{ message: "Throttled" }] } : { data: { x: 1 } }));
    };
    const waits: number[] = [];
    expect(await adminGraphql(cfg, "q", {}, ok as typeof fetch, async (ms) => void waits.push(ms))).toEqual({ x: 1 });
    expect(waits).toHaveLength(2);
    const cfg2 = { ...cfg, store: "t2.myshopify.com" };
    const never = async (url: string | URL | Request) => String(url).includes("oauth") ? new Response(JSON.stringify({ access_token: "tok" })) : new Response(JSON.stringify({ errors: [{ message: "Throttled" }] }));
    await expect(adminGraphql(cfg2, "q", {}, never as typeof fetch, async () => {})).rejects.toThrow(/Throttled/);
    const bad = async (url: string | URL | Request) => String(url).includes("oauth") ? new Response(JSON.stringify({ access_token: "tok" })) : new Response(JSON.stringify({ errors: [{ message: "Field x missing" }] }));
    await expect(adminGraphql({ ...cfg, store: "t3.myshopify.com" }, "q", {}, bad as typeof fetch, async () => { throw new Error("should not wait"); })).rejects.toThrow(/Field x/);
  });
});
