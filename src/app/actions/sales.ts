"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { runOrdersSync } from "@/lib/shopify-sync";
import { ordersConfig } from "@/lib/shopify-orders";

/** "Sync orders now": runs in the background; the Sales page shows the result. */
export async function syncOrdersNowAction() {
  const s = await assertPermission("sales.view_all_branches");
  if (!ordersConfig()) redirect("/sales?tab=website&err=not_connected");
  after(async () => {
    const r = await runOrdersSync("manual", s.id);
    await audit(s.id, "orders.sync", "sync_run", r.runId ?? null, { ok: r.ok, counts: r.counts ?? null, error: r.error ?? null });
  });
  revalidatePath("/sales");
  redirect("/sales?tab=website&started=1");
}
