import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runOrdersSync, runShopifySync } from "@/lib/shopify-sync";
import { ordersToQuotations, pushPrices, pushStock } from "@/lib/website-push";
import { runMetaSync } from "@/lib/marketing-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const got = req.headers.get("authorization") ?? "";
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(got), h(`Bearer ${secret}`));
}

/** Called once a day by Vercel Cron (see vercel.json): website products and orders, then portal → website. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const products = await runShopifySync("daily", null);
  // Orders after products, so new items exist before their orders arrive.
  const orders = await runOrdersSync("daily", null);
  // Portal → website full check (only when switched on): today's prices (sales start/end), all website stock.
  const quotes = await ordersToQuotations();
  const prices = await pushPrices(null);
  const stock = await pushStock(null);
  // Meta ads results for the marketing plan (skipped when Meta isn't connected)
  const meta = await runMetaSync();
  const ok = products.ok && (orders.ok || orders.error === "not_connected");
  return NextResponse.json({ products, orders, quotes, prices, stock, meta }, { status: ok ? 200 : 500 });
}
