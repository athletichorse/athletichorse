/**
 * Website (Shopify) catalogue import — reads the store's public product feed
 * (/products.json): names, prices, variants, options and images. No token needed.
 * The pure helpers here are unit-tested; runShopifySync() lives in shopify-sync.ts.
 */

export type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  body_html?: string | null;
  vendor?: string;
  product_type?: string;
  tags?: string[];
  options?: { name: string; position: number }[];
  variants: {
    id: number;
    sku?: string | null;
    option1?: string | null;
    option2?: string | null;
    option3?: string | null;
    price: string;
    compare_at_price?: string | null;
    position?: number;
    featured_image?: { src: string } | null;
  }[];
  images: { id: number; src: string; alt?: string | null; position?: number }[];
};

export const PAGE_SIZE = 250;
const MAX_PAGES = 100; // 25,000 products — a safety stop

/** "athletic-horse.com" / "https://athletic-horse.com/" → "https://athletic-horse.com" */
export function normalizeStoreUrl(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const u = new URL(s);
  if (u.protocol !== "https:") throw new Error("Store URL must use https");
  return `https://${u.host}`;
}

const PRICE = /^\d{1,10}(\.\d{1,2})?$/;

/** Keep only what the sync needs, and reject malformed data before it reaches SQL. */
export function slimProduct(p: ShopifyProduct): ShopifyProduct {
  if (!Number.isSafeInteger(p.id)) throw new Error(`Bad product id: ${p.id}`);
  return {
    id: p.id,
    title: String(p.title ?? "").slice(0, 500),
    handle: String(p.handle ?? ""),
    body_html: String(p.body_html ?? "").slice(0, 20000),
    vendor: String(p.vendor ?? ""),
    product_type: String(p.product_type ?? ""),
    tags: Array.isArray(p.tags) ? p.tags.map(String).slice(0, 50) : [],
    options: (p.options ?? []).map((o) => ({ name: String(o.name), position: Number(o.position) || 1 })),
    variants: (p.variants ?? []).map((v) => {
      if (!Number.isSafeInteger(v.id)) throw new Error(`Bad variant id: ${v.id}`);
      if (!PRICE.test(String(v.price))) throw new Error(`Bad price "${v.price}" on variant ${v.id}`);
      const cmp = v.compare_at_price && PRICE.test(String(v.compare_at_price)) ? String(v.compare_at_price) : null;
      return {
        id: v.id,
        sku: v.sku ? String(v.sku).trim() : null,
        option1: v.option1 ?? null,
        option2: v.option2 ?? null,
        option3: v.option3 ?? null,
        price: String(v.price),
        compare_at_price: cmp,
        position: Number(v.position) || 1,
        featured_image: v.featured_image?.src ? { src: v.featured_image.src } : null,
      };
    }),
    images: (p.images ?? []).filter((i) => Number.isSafeInteger(i.id) && i.src).map((i) => ({
      id: i.id,
      src: i.src,
      alt: i.alt ?? "",
      position: Number(i.position) || 1,
    })),
  };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Download every product page. Throws if any page fails, so a partial feed never deactivates products. */
export async function fetchAllProducts(storeUrl: string, fetchImpl: typeof fetch = fetch): Promise<ShopifyProduct[]> {
  const base = normalizeStoreUrl(storeUrl);
  const all: ShopifyProduct[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetchImpl(`${base}/products.json?limit=${PAGE_SIZE}&page=${page}`, {
      headers: { accept: "application/json", "user-agent": "staff-portal-sync/1.0" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Website returned ${res.status} on page ${page}`);
    const body = (await res.json()) as { products?: ShopifyProduct[] };
    const items = body.products ?? [];
    all.push(...items.map(slimProduct));
    if (items.length < PAGE_SIZE) return all;
  }
  throw new Error("Too many pages — stopped for safety");
}
