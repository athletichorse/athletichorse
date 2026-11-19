import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { productError, SupplierFields, UNITS, UNIT_AR, type Group } from "@/components/ProductFields";
import { supplierNames } from "@/lib/supplier-names";
import { createProductAction } from "@/app/actions/products";

/** New item: details, prices (incl. price levels), offer price for a period, colours and sizes. */
export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const me = await requireStaff();
  if (!me.perms.has("products.edit") && !me.perms.has("products.add")) redirect("/forbidden");
  const { t, locale } = await getDict();
  const N = t.products.newForm;
  const sp = await searchParams;
  const [{ data: groups }, { data: levels }] = await Promise.all([
    db().from("product_groups").select("id, parent_id, name_en, name_ar").eq("active", true).order("name_en"),
    db().from("price_levels").select("id, name_en, name_ar").eq("active", true).neq("code", "wholesale").order("sort"),
  ]);
  const gs = (groups ?? []) as Group[];
  const names = await supplierNames();
  const label = (g: Group) => (locale === "ar" && g.name_ar ? g.name_ar : g.name_en);
  const top = gs.filter((g) => !g.parent_id);
  const subs = gs.filter((g) => g.parent_id);
  const err = sp.err === "too_many" ? N.tooMany : productError(t, sp.err);
  const seeCost = me.perms.has("products.view_cost");
  const canOffer = me.perms.has("products.sale_prices");
  return (
    <>
      <PageHeader title={t.products.newProduct} t={t}>
        <Link href="/products" className="btn-ghost no-print">← {t.products.title}</Link>
      </PageHeader>
      {err && <p className="alert-err">{err}</p>}
      <form action={createProductAction} className="space-y-6" data-testid="new-product">
        <section className="card grid gap-4 sm:grid-cols-3">
          <div><label className="label" htmlFor="np-sku">{N.barcode}</label><input id="np-sku" name="sku" className="input font-mono" dir="ltr" autoCapitalize="none" /></div>
          <div><label className="label" htmlFor="np-group">{N.group}</label>
            <select id="np-group" name="group_id" className="input" defaultValue="">
              <option value="">—</option>
              {top.map((g) => <option key={g.id} value={g.id}>{label(g)}</option>)}
            </select></div>
          <div><label className="label" htmlFor="np-type">{N.type}</label>
            <input id="np-type" name="subgroup_name" list="np-types" className="input" autoComplete="off" />
            <datalist id="np-types">{subs.map((g) => <option key={g.id} value={label(g)} />)}</datalist>
            <p className="hint">{N.typeHint}</p></div>
          <div><label className="label" htmlFor="np-ar">{N.nameAr}</label><input id="np-ar" name="name_ar" className="input" dir="rtl" /></div>
          <div><label className="label" htmlFor="np-en">{N.nameEn}</label><input id="np-en" name="name_en" className="input" dir="ltr" /></div>
          <div><label className="label" htmlFor="np-unit">{N.unit}</label>
            <select id="np-unit" name="unit" defaultValue="piece" className="input">
              {UNITS.map((u) => <option key={u} value={u}>{locale === "ar" ? UNIT_AR[u] : u}</option>)}
            </select></div>
          <SupplierFields t={t} suppliers={names.suppliers} factories={names.factories} />
          <div className="flex flex-wrap gap-6 sm:col-span-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked className="h-4 w-4 accent-[var(--brand)]" />{N.active}</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_service" className="h-4 w-4 accent-[var(--brand)]" />{N.service}</label>
          </div>
        </section>

        <section className="card grid gap-4 sm:grid-cols-4">
          <h2 className="card-title sm:col-span-4">{N.prices}</h2>
          {seeCost && <div><label className="label" htmlFor="np-cost">{N.cost}</label><input id="np-cost" name="cost" className="input" dir="ltr" inputMode="decimal" /></div>}
          <div><label className="label" htmlFor="np-price">{N.price}</label><input id="np-price" name="price" className="input" dir="ltr" inputMode="decimal" /></div>
          <div><label className="label" htmlFor="np-wh">{N.wholesale}</label><input id="np-wh" name="wholesale" className="input" dir="ltr" inputMode="decimal" /></div>
          <div><label className="label" htmlFor="np-reorder">{N.reorder}</label><input id="np-reorder" name="reorder" className="input" dir="ltr" inputMode="decimal" /></div>
          {(levels ?? []).map((l) => {
            const name = (locale === "ar" && l.name_ar) || l.name_en;
            return <div key={l.id}><label className="label" htmlFor={`np-l-${l.id}`}>{t.levels.level}: {name}</label><input id={`np-l-${l.id}`} name={`level:${l.id}`} className="input" dir="ltr" inputMode="decimal" /></div>;
          })}
        </section>

        {canOffer && (
          <section className="card grid gap-4 sm:grid-cols-3">
            <h2 className="card-title sm:col-span-3">{N.offer}</h2>
            <p className="hint -mt-2 sm:col-span-3">{N.offerHint}</p>
            <div><label className="label" htmlFor="np-offer">{N.offerPrice}</label><input id="np-offer" name="sale" className="input" dir="ltr" inputMode="decimal" /></div>
            <div><label className="label" htmlFor="np-from">{N.from}</label><input id="np-from" type="date" name="sale_from" className="input" dir="ltr" /></div>
            <div><label className="label" htmlFor="np-to">{N.to}</label><input id="np-to" type="date" name="sale_to" className="input" dir="ltr" /></div>
          </section>
        )}

        <section className="card grid gap-4 sm:grid-cols-2">
          <h2 className="card-title sm:col-span-2">{N.variants}</h2>
          <p className="hint -mt-2 sm:col-span-2">{N.variantsHint}</p>
          <div><label className="label" htmlFor="np-colours">{N.colours}</label><input id="np-colours" name="colours" className="input" placeholder={N.coloursPh} /></div>
          <div><label className="label" htmlFor="np-sizes">{N.sizes}</label><input id="np-sizes" name="sizes" className="input" placeholder={N.sizesPh} /></div>
        </section>

        <div className="flex justify-end"><button className="btn-primary">{N.save}</button></div>
      </form>
    </>
  );
}
