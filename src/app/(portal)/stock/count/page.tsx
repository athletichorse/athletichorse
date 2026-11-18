import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { CountSheet } from "@/components/CountSheet";

export const dynamic = "force-dynamic";

/** Count sheet: every item of one location on one page (code, item, price, system, actual, difference). */
export default async function CountPage({ searchParams }: { searchParams: Promise<{ loc?: string }> }) {
  const me = await requirePermission("stock.count");
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const { data: locs } = await db().from("locations").select("id, name_en, name_ar").eq("active", true).order("code");
  const mine = (locs ?? []).filter((l) => me.locations === "all" || me.locations.includes(l.id));
  const loc = mine.find((l) => l.id === sp.loc)?.id ?? mine[0]?.id;
  const rows: { variantId: string; sku: string | null; name: string; options: string; price: string; system: number }[] = [];
  if (loc) {
    for (let from = 0; from < 50_000; from += 1000) {
      const { data } = await db().from("stock_shortage_list").select("variant_id, sku, name_en, name_ar, option1, option2, option3, price, qty").eq("location_id", loc).order("name_en").order("variant_id").range(from, from + 999);
      for (const r of data ?? []) rows.push({ variantId: r.variant_id, sku: r.sku, name: (locale === "ar" && r.name_ar) || r.name_en, options: [r.option1, r.option2, r.option3].filter(Boolean).join(" / "), price: String(r.price), system: Number(r.qty) });
      if (!data || data.length < 1000) break;
    }
  }
  return (
    <>
      <PageHeader title={t.stock.flow.countSheet} t={t} filename="count-sheet">
        <Link href="/stock" className="btn-ghost no-print">← {t.stock.title}</Link>
      </PageHeader>
      <form className="no-print mb-4 flex gap-2" action="/stock/count">
        <select name="loc" defaultValue={loc} className="input w-auto">{mine.map((l) => <option key={l.id} value={l.id}>{locale === "ar" ? l.name_ar : l.name_en || l.name_ar}</option>)}</select>
        <button className="btn-ghost">{t.stock.flow.show}</button>
      </form>
      {loc && <CountSheet key={loc} t={t} locale={locale} locationId={loc} locationName={(() => { const l = mine.find((x) => x.id === loc); return l ? (locale === "ar" ? l.name_ar : l.name_en || l.name_ar) : ""; })()} rows={rows} />}
    </>
  );
}
