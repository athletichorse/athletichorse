import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { LabelPrinter } from "@/components/LabelPrinter";

export const dynamic = "force-dynamic";

/** Barcode labels. ?product=<id> starts with all of that item's colours/sizes. */
export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  await requirePermission("products.labels");
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const { data } = sp.product && /^[0-9a-f-]{36}$/i.test(sp.product)
    ? await db().from("variant_search").select("variant_id, sku, price, option1, option2, option3, name_en, name_ar").eq("product_id", sp.product).not("sku", "is", null)
    : { data: [] };
  const initial = (data ?? []).map((r) => ({
    variantId: r.variant_id, sku: String(r.sku), price: String(r.price), qty: 1,
    name: (locale === "ar" && r.name_ar) || r.name_en || r.name_ar, options: [r.option1, r.option2, r.option3].filter(Boolean).join(" / "),
  }));
  return (
    <>
      <PageHeader title={t.products.labels.title} t={t} />
      <LabelPrinter t={t} locale={locale} initial={initial} />
    </>
  );
}
