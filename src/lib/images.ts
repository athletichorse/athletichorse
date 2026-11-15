/** Smaller copy of a Shopify image (their CDN resizes on the fly). Other URLs are returned unchanged. */
export function thumb(url: string | null | undefined, width = 160): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("//") ? `https:${url}` : url);
    if (u.hostname.endsWith("cdn.shopify.com") || u.pathname.includes("/cdn/shop/")) u.searchParams.set("width", String(width));
    return u.toString();
  } catch {
    return null;
  }
}
