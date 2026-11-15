import { describe, expect, it } from "vitest";
import { chunk, fetchAllProducts, normalizeStoreUrl, slimProduct, type ShopifyProduct } from "@/lib/shopify";
import { thumb } from "@/lib/images";

const product = (id: number, extra: Partial<ShopifyProduct> = {}): ShopifyProduct => ({
  id,
  title: `Item ${id}`,
  handle: `item-${id}`,
  body_html: "<p>x</p>",
  vendor: "Alhisan Alriyadi",
  product_type: "Fitness",
  tags: ["a"],
  options: [{ name: "Size", position: 1 }],
  variants: [{ id: id * 10, sku: " AB-1 ", option1: "S", price: "49.00", compare_at_price: "", featured_image: null }],
  images: [{ id: id * 100, src: "https://cdn.shopify.com/x.jpg", alt: null, position: 1 }],
  ...extra,
});

describe("store url", () => {
  it("normalises", () => {
    expect(normalizeStoreUrl("athletic-horse.com")).toBe("https://athletic-horse.com");
    expect(normalizeStoreUrl("https://athletic-horse.com/collections/all")).toBe("https://athletic-horse.com");
  });
  it("rejects http", () => expect(() => normalizeStoreUrl("http://x.com")).toThrow());
});

describe("slimProduct", () => {
  it("keeps what the sync needs and trims SKUs", () => {
    const s = slimProduct(product(1));
    expect(s.variants[0]).toMatchObject({ id: 10, sku: "AB-1", price: "49.00", compare_at_price: null });
    expect(s.images[0]).toMatchObject({ id: 100, alt: "" });
  });
  it("rejects malformed prices so bad data never reaches the database", () => {
    const bad = product(2, { variants: [{ id: 20, price: "49,00" }] });
    expect(() => slimProduct(bad)).toThrow(/Bad price/);
  });
  it("caps long descriptions", () => {
    expect(slimProduct(product(3, { body_html: "x".repeat(50000) })).body_html).toHaveLength(20000);
  });
});

describe("fetchAllProducts", () => {
  const fakeFetch = (pages: ShopifyProduct[][], failOn?: number) =>
    (async (url: string | URL | Request) => {
      const page = Number(new URL(String(url)).searchParams.get("page"));
      if (page === failOn) return new Response("err", { status: 503 });
      return Response.json({ products: pages[page - 1] ?? [] });
    }) as typeof fetch;

  it("reads every page until a short page", async () => {
    const full = Array.from({ length: 250 }, (_, i) => product(i + 1));
    const all = await fetchAllProducts("athletic-horse.com", fakeFetch([full, [product(999)]]));
    expect(all).toHaveLength(251);
  });
  it("fails the whole sync if any page fails (never half-imports)", async () => {
    const full = Array.from({ length: 250 }, (_, i) => product(i + 1));
    await expect(fetchAllProducts("athletic-horse.com", fakeFetch([full, full], 2))).rejects.toThrow(/503/);
  });
});

describe("helpers", () => {
  it("chunks", () => expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]));
  it("resizes Shopify images only", () => {
    expect(thumb("https://cdn.shopify.com/a.jpg?v=1", 96)).toBe("https://cdn.shopify.com/a.jpg?v=1&width=96");
    expect(thumb("//athletic-horse.com/cdn/shop/files/a.jpg", 50)).toBe("https://athletic-horse.com/cdn/shop/files/a.jpg?width=50");
    expect(thumb("https://example.com/a.jpg", 50)).toBe("https://example.com/a.jpg");
    expect(thumb(null)).toBeNull();
  });
});
