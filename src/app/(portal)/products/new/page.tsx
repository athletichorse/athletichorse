import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { ProductFields, productError, type Group } from "@/components/ProductFields";
import { createProductAction } from "@/app/actions/products";

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const me = await requirePermission("products.edit");
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const { data: groups } = await db().from("product_groups").select("id, parent_id, name_en, name_ar").eq("active", true).order("name_en");
  const err = productError(t, sp.err);
  return (
    <>
      <PageHeader title={t.products.newProduct} t={t}>
        <Link href="/products" className="btn-ghost no-print">← {t.products.title}</Link>
      </PageHeader>
      {err && <p className="alert-err">{err}</p>}
      <form action={createProductAction} className="space-y-6">
        <section className="card"><ProductFields t={t} locale={locale} groups={(groups ?? []) as Group[]} /></section>
        <section className="card grid gap-4 sm:grid-cols-3">
          <div><label className="label">{t.products.sku}</label><input name="sku" className="input font-mono" dir="ltr" autoCapitalize="none" /></div>
          <div><label className="label">{t.products.price}</label><input name="price" className="input" dir="ltr" inputMode="decimal" placeholder="0.00" /></div>
          {me.perms.has("products.view_cost") && <div><label className="label">{t.products.cost}</label><input name="cost" className="input" dir="ltr" inputMode="decimal" placeholder="0.00" /></div>}
        </section>
        <div className="flex justify-end"><button className="btn-primary">{t.add}</button></div>
      </form>
    </>
  );
}
