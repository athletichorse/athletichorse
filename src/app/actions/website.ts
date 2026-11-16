"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { connectWebhooks, ordersToQuotations, pushPrices, pushStock, webSwitches } from "@/lib/website-push";

const back = (q: string) => redirect(`/company?${q}#website`);

/** Company → Website: the three switches (all off by default) and the Shopify location. */
export async function saveWebsiteAction(form: FormData) {
  const staff = await assertPermission("settings.edit");
  const before = await webSwitches();
  const next = {
    push_prices: form.get("shopify_push_prices") === "on",
    push_stock: form.get("shopify_push_stock") === "on",
    orders_to_quotes: form.get("web_orders_to_quotes") === "on",
  };
  const loc = String(form.get("shopify_location_id") ?? "").trim();
  if (loc && !/^(gid:\/\/shopify\/Location\/)?\d{1,20}$/.test(loc)) return back("err=location");
  const rows: { key: string; value: unknown }[] = [
    { key: "shopify_push_prices", value: next.push_prices },
    { key: "shopify_push_stock", value: next.push_stock },
    { key: "web_orders_to_quotes", value: next.orders_to_quotes },
    { key: "shopify_location_id", value: loc },
  ];
  const now = new Date().toISOString();
  // Orders → quotations: stock then moves when the order is collected at the till, not on import.
  if (next.orders_to_quotes && !before.orders_to_quotes) {
    rows.push({ key: "web_orders_quotes_from", value: now }, { key: "web_orders_stock_from", value: "9999-01-01T00:00:00Z" });
  } else if (!next.orders_to_quotes && before.orders_to_quotes) {
    rows.push({ key: "web_orders_stock_from", value: now });
  }
  const { error } = await db().from("settings").upsert(rows);
  if (error) return back(`err=${encodeURIComponent(error.message)}`);
  await audit(staff.id, "website.settings", "settings", "website", { ...next, shopify_location_id: loc || null });
  revalidatePath("/company");
  back("ok=1");
}

/** Buttons: send all prices / all stock now, connect webhooks, make quotations now. */
export async function websiteNowAction(form: FormData) {
  const staff = await assertPermission("settings.edit");
  const what = String(form.get("what") ?? "");
  let r: { ok: boolean; error?: string; sent?: number; added?: number; made?: number };
  if (what === "prices") r = await pushPrices(null);
  else if (what === "stock") r = await pushStock(null);
  else if (what === "quotes") r = { ok: true, ...(await ordersToQuotations()) };
  else if (what === "webhooks") {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
    if (!host || /localhost|127\.0\.0\.1/.test(host)) return back("err=webhooks_local");
    r = await connectWebhooks(`https://${host}`);
  } else return back("err=bad_request");
  await audit(staff.id, `website.${what}`, "settings", "website", { ok: r.ok, error: r.error ?? null });
  revalidatePath("/company");
  back(r.ok ? `done=${what}&n=${r.sent ?? r.added ?? r.made ?? 0}` : `err=${encodeURIComponent(r.error === "off" ? "switch_off" : r.error ?? "failed")}`);
}
