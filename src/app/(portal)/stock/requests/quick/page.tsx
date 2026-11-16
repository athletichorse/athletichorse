import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { QuickRequest } from "@/components/QuickRequest";

export const dynamic = "force-dynamic";

/** Quick request: one stock column per store; click a store's number to ask it for the item. */
export default async function QuickRequestPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requirePermission("stock.requests");
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase().replace(/[%_\\]/g, "").slice(0, 60);
  const { data: locs } = await db().from("locations").select("id, code, name_en, name_ar").eq("active", true).order("code");
  const stores = (locs ?? []).map((l) => ({ id: l.id, name: locale === "ar" ? l.name_ar : l.name_en || l.name_ar, code: l.code }));
  let query = db().from("stock_shortage_list").select("location_id, variant_id, sku, name_en, name_ar, option1, option2, option3, price, qty").order("name_en").order("variant_id").limit(300 * Math.max(1, stores.length));
  if (q) query = query.ilike("search", `%${q}%`);
  const { data } = await query;
  const items = new Map<string, { variantId: string; sku: string | null; name: string; options: string; price: string; stock: Record<string, number> }>();
  for (const r of (data ?? []) as { location_id: string; variant_id: string; sku: string | null; name_en: string; name_ar: string; option1: string | null; option2: string | null; option3: string | null; price: string; qty: string }[]) {
    const it = items.get(r.variant_id) ?? { variantId: r.variant_id, sku: r.sku, name: (locale === "ar" && r.name_ar) || r.name_en, options: [r.option1, r.option2, r.option3].filter(Boolean).join(" / "), price: String(r.price), stock: {} as Record<string, number> };
    it.stock[r.location_id] = Number(r.qty);
    items.set(r.variant_id, it);
  }
  const mine = stores.filter((s) => me.locations === "all" || me.locations.includes(s.id));
  return (
    <>
      <PageHeader title={t.stock.flow.quick} subtitle={t.stock.flow.clickStore} t={t}>
        <Link href="/stock/requests" className="btn-ghost no-print">← {t.stock.flow.tabs.requests}</Link>
      </PageHeader>
      <form className="no-print mb-4" action="/stock/requests/quick"><input name="q" defaultValue={sp.q ?? ""} placeholder={t.stock.flow.filter} className="input" /></form>
      <QuickRequest t={t} stores={stores} mine={mine} items={[...items.values()].slice(0, 300)} />
    </>
  );
}
