/* eslint-disable @next/next/no-img-element -- product photos come from the website's CDN, already resized */
import { expectedSar, readRates } from "@/lib/fx";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { thumb } from "@/lib/images";
import { PageHeader } from "@/components/PageHeader";
import { ProductFields, productError, type Group } from "@/components/ProductFields";
import { supplierNames } from "@/lib/supplier-names";
import { saveProductAction } from "@/app/actions/products";

type Variant = { wholesale_price: string | null; reorder_level: string | null; sale_price: string | null; sale_from: string | null; sale_to: string | null; id: string; sku: string | null; option1: string | null; option2: string | null; option3: string | null; price: string; compare_at_price: string | null; cost: string | null; active: boolean; shopify_variant_id: number | null; shopify_sku: string | null; image_url: string | null };

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string; ok?: string }> }) {
  const me = await requirePermission("products.view");
  const { t, locale } = await getDict();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const canEdit = me.perms.has("products.edit");
  const seeCost = me.perms.has("products.view_cost");
  const canSale = me.perms.has("products.sale_prices");

  const [{ data: p }, { data: vData }, { data: images }, { data: groups }, { data: storeUrl }, { data: fx }] = await Promise.all([
    db().from("products").select("*").eq("id", id).maybeSingle(),
    db().from("product_variants").select("id, sku, option1, option2, option3, price, compare_at_price, cost, active, shopify_variant_id, shopify_sku, image_url, wholesale_price, reorder_level, sale_price, sale_from, sale_to").eq("product_id", id).order("position"),
    db().from("product_images").select("url, alt").eq("product_id", id).order("position"),
    db().from("product_groups").select("id, parent_id, name_en, name_ar").eq("active", true).order("name_en"),
    db().from("settings").select("value").eq("key", "shopify_store_url").maybeSingle(),
    db().from("settings").select("value").eq("key", "fx_rates").maybeSingle(),
  ]);
  const { data: pushSw } = await db().from("settings").select("value").eq("key", "shopify_push_prices").maybeSingle();
  // while portal prices go to the website, website items' prices are edited here
  const webPricesHere = pushSw?.value === true || pushSw?.value === "true";
  if (!p) notFound();
  const variants = (vData ?? []) as Variant[];
  const ids = variants.map((v) => v.id);
  const { data: codes } = ids.length ? await db().from("product_codes").select("code, variant_id").in("variant_id", ids) : { data: [] };
  // price levels other than wholesale (that one is the wholesale column)
  const { data: levelRows } = await db().from("price_levels").select("id, name_en, name_ar").eq("active", true).neq("code", "wholesale").order("sort");
  const levels = levelRows ?? [];
  const { data: lpRows } = levels.length && ids.length ? await db().from("variant_level_prices").select("variant_id, level_id, price").in("variant_id", ids) : { data: [] };
  const levelPrice = (vid: string, lid: string) => lpRows?.find((x) => x.variant_id === vid && x.level_id === lid)?.price;
  const fromWebsite = p.shopify_product_id !== null;
  const names = await supplierNames();
  const opts: string[] = Array.isArray(p.options) ? p.options : [];
  const optionLabel = (v: Variant) => [v.option1, v.option2, v.option3].filter(Boolean).join(" / ") || t.products.none;
  const err = productError(t, sp.err);
  const webUrl = fromWebsite && p.shopify_handle && typeof storeUrl?.value === "string" ? `${storeUrl.value}/products/${p.shopify_handle}` : null;

  return (
    <>
      <PageHeader title={locale === "ar" && p.name_ar ? p.name_ar : p.name_en} subtitle={fromWebsite ? t.products.nameFromWebsite : undefined} t={t} filename="product">
        <Link href="/products" className="btn-ghost no-print">← {t.products.title}</Link>
        {me.perms.has("products.labels") && <Link href={`/products/labels?product=${p.id}`} className="btn-ghost no-print">{t.products.labels.open}</Link>}
        {webUrl && <a href={webUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost no-print">{t.products.viewOnWebsite} ↗</a>}
      </PageHeader>
      {err && <p className="alert-err">{err}</p>}
      {sp.ok && <p className="alert-ok">{t.saved}</p>}

      <form action={saveProductAction} className="space-y-6">
        <input type="hidden" name="id" value={p.id} />
        <fieldset disabled={!canEdit} className="space-y-6">
          <section className="card">
            <ProductFields t={t} locale={locale} groups={(groups ?? []) as Group[]} value={p} nameLocked={fromWebsite} suppliers={names.suppliers} factories={names.factories} seeCost={seeCost} expected={expectedSar(p.china_price, p.china_currency, readRates(fx?.value))} />
            <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" name="active" defaultChecked={p.active} className="h-4 w-4 accent-[var(--brand)]" /> {t.active}
            </label>
          </section>

          <section className="card overflow-hidden p-0">
            <h2 className="card-title px-5 pt-5">{t.products.variants} ({variants.length}){opts.length > 0 && <span className="ms-2 text-sm font-normal text-gray-500">{opts.join(" · ")}</span>}</h2>
            <div className="overflow-x-auto">
              <table className="table" data-export>
                <thead>
                  <tr><th className="w-12"></th><th>{t.products.options}</th><th>{t.products.sku}</th><th>{t.products.codes}</th><th>{t.products.price}</th>{seeCost && <th>{t.products.cost}</th>}<th>{t.active}</th></tr>
                </thead>
                <tbody>
                  {variants.map((v) => {
                    const img = thumb(v.image_url, 80);
                    const vc = (codes ?? []).filter((c) => c.variant_id === v.id).map((c) => c.code).join(", ");
                    return (
                      <tr key={v.id}>
                        <td className="cell-media">{img ? <img src={img} alt="" loading="lazy" className="h-9 w-9 rounded-md border border-[var(--line)] object-cover" /> : <div className="h-9 w-9 rounded-md bg-gray-100" />}</td>
                        <td className="cell-title font-medium whitespace-nowrap">{optionLabel(v)}</td>
                        <td data-label={t.products.sku} className="min-w-[170px]">
                          <input name={`sku:${v.id}`} defaultValue={v.sku ?? ""} placeholder={v.shopify_sku ? `${t.products.fromWebsite}: ${v.shopify_sku}` : ""} className={`input font-mono ${v.sku ? "" : "border-amber-300 bg-amber-50"}`} dir="ltr" autoCapitalize="none" />
                        </td>
                        <td data-label={t.products.codes} className="min-w-[160px]">
                          <input name={`codes:${v.id}`} defaultValue={vc} placeholder={t.products.codesHint} className="input font-mono" dir="ltr" autoCapitalize="none" />
                        </td>
                        <td data-label={t.products.price} className="min-w-[120px]">
                          {v.shopify_variant_id === null || webPricesHere ? (
                            <input name={`price:${v.id}`} defaultValue={v.price} className="input" dir="ltr" inputMode="decimal" />
                          ) : (
                            <span className="whitespace-nowrap">{v.price}{v.compare_at_price && <s className="ms-2 text-xs text-gray-400">{v.compare_at_price}</s>}</span>
                          )}
                        </td>
                        {seeCost && (
                          <td data-label={t.products.cost} className="min-w-[110px]"><input name={`cost:${v.id}`} defaultValue={v.cost ?? ""} className="input" dir="ltr" inputMode="decimal" /></td>
                        )}
                        <td data-label={t.active}><input type="checkbox" name={`active:${v.id}`} defaultChecked={v.active} className="h-4 w-4 accent-[var(--brand)]" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card overflow-hidden p-0">
            <h2 className="card-title px-5 pt-5">{t.products.extras.title}</h2>
            <p className="hint px-5 -mt-2 mb-3">{t.products.extras.hint}</p>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>{t.products.options}</th><th>{t.products.extras.wholesale}</th><th>{t.products.extras.reorder}</th><th>{t.products.extras.salePrice}</th><th>{t.products.extras.from}</th><th>{t.products.extras.to}</th></tr>
                </thead>
                <tbody>
                  {variants.map((v) => (
                    <tr key={v.id}>
                      <td className="cell-title font-medium whitespace-nowrap">{optionLabel(v)} <span className="text-xs text-gray-400" dir="ltr">{v.sku ?? ""}</span></td>
                      <td data-label={t.products.extras.wholesale} className="min-w-[110px]"><input name={`wholesale:${v.id}`} defaultValue={v.wholesale_price ?? ""} className="input" dir="ltr" inputMode="decimal" /></td>
                      <td data-label={t.products.extras.reorder} className="min-w-[90px]"><input name={`reorder:${v.id}`} defaultValue={v.reorder_level ?? ""} className="input" dir="ltr" inputMode="decimal" /></td>
                      <td data-label={t.products.extras.salePrice} className="min-w-[110px]"><input name={`sale:${v.id}`} defaultValue={v.sale_price ?? ""} disabled={!canSale} className="input" dir="ltr" inputMode="decimal" /></td>
                      <td data-label={t.products.extras.from} className="min-w-[150px]"><input type="date" name={`sale_from:${v.id}`} defaultValue={v.sale_from?.slice(0, 10) ?? ""} disabled={!canSale} className="input" dir="ltr" /></td>
                      <td data-label={t.products.extras.to} className="min-w-[150px]"><input type="date" name={`sale_to:${v.id}`} defaultValue={v.sale_to?.slice(0, 10) ?? ""} disabled={!canSale} className="input" dir="ltr" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {levels.length > 0 && (
            <section className="card overflow-hidden p-0" data-testid="level-prices">
              <h2 className="card-title px-5 pt-5">{t.levels.pricesTitle}</h2>
              <p className="hint px-5 -mt-2 mb-3">{t.levels.pricesHint}</p>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th>{t.products.options}</th><th>{t.products.price}</th>{levels.map((l) => <th key={l.id}>{(locale === "ar" && l.name_ar) || l.name_en}</th>)}</tr></thead>
                  <tbody>
                    {variants.map((v) => (
                      <tr key={v.id}>
                        <td className="cell-title font-medium whitespace-nowrap">{optionLabel(v)} <span className="text-xs text-gray-400" dir="ltr">{v.sku ?? ""}</span></td>
                        <td data-label={t.products.price} dir="ltr">{Number(v.price).toFixed(2)}</td>
                        {levels.map((l) => {
                          const name = (locale === "ar" && l.name_ar) || l.name_en;
                          const cur = levelPrice(v.id, l.id);
                          return (
                            <td key={l.id} data-label={name} className="min-w-[110px]">
                              <input name={`level:${l.id}:${v.id}`} aria-label={`${name} · ${optionLabel(v)}`} defaultValue={cur === undefined || cur === null ? "" : Number(cur).toFixed(2)} placeholder={Number(v.price).toFixed(2)} className="input" dir="ltr" inputMode="decimal" />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </fieldset>

        {(images ?? []).length > 0 && (
          <section className="card">
            <h2 className="card-title">{t.products.images}</h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
              {(images ?? []).map((im) => (
                <a key={im.url} href={im.url} target="_blank" rel="noopener noreferrer">
                  <img src={thumb(im.url, 240) ?? im.url} alt={im.alt} loading="lazy" className="aspect-square w-full rounded-lg border border-[var(--line)] object-cover" />
                </a>
              ))}
            </div>
          </section>
        )}

        {canEdit && (
          <div className="no-print sticky bottom-4 flex justify-end">
            <button className="btn-primary shadow-lg">{t.products.saveAll}</button>
          </div>
        )}
      </form>
    </>
  );
}
