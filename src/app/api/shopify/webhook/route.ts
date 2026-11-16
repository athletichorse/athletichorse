import { after, NextResponse, type NextRequest } from "next/server";
import { ordersConfig } from "@/lib/shopify-orders";
import { verifyWebhook } from "@/lib/shopify-admin";
import { runShopifySync, syncOrdersSince } from "@/lib/shopify-sync";
import { ordersToQuotations } from "@/lib/website-push";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Website → portal straight away (orders and products), signed by Shopify with the app secret.
 * Answers at once; the work runs after the answer. The daily sync still checks everything.
 */
export async function POST(req: NextRequest) {
  const cfg = ordersConfig();
  const raw = await req.text();
  if (!cfg || !verifyWebhook(raw, req.headers.get("x-shopify-hmac-sha256"), cfg.clientSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const topic = req.headers.get("x-shopify-topic") ?? "";
  let updatedAt: string | null = null;
  try { updatedAt = (JSON.parse(raw) as { updated_at?: string }).updated_at ?? null; } catch { /* not JSON */ }
  after(async () => {
    if (topic.startsWith("orders/")) {
      const since = new Date((updatedAt ? Date.parse(updatedAt) : Date.now()) - 2 * 60_000).toISOString();
      const r = await syncOrdersSince(since);
      if (r.ok) await ordersToQuotations();
    } else if (topic.startsWith("products/")) {
      await runShopifySync("manual", null);
    }
  });
  return NextResponse.json({ ok: true });
}
