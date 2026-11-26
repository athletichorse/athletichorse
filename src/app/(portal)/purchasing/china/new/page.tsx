import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { ChinaOrderForm, type CnInitial } from "@/components/ChinaOrderForm";

type CnInitialLine = CnInitial["lines"][number];
import { readRates } from "@/lib/fx";

export const dynamic = "force-dynamic";

/** New China order (the CNY rate starts from Purchases → Exchange rates). */
export default async function NewChinaOrder({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  await requirePermission("purchasing.view");
  const me = await requirePermission("purchasing.edit");
  const { t, locale } = await getDict();
  const [{ data: sups }, { data: locs }, { data: fx }] = await Promise.all([
    db().from("suppliers").select("id, name").eq("active", true).order("name"),
    db().from("locations").select("id, name_en, name_ar").eq("active", true).order("code"),
    db().from("settings").select("value").eq("key", "fx_rates").maybeSingle(),
  ]);
  const locations = (locs ?? []).filter((l) => me.locations === "all" || me.locations.includes(l.id)).map((l) => ({ id: l.id, name: (locale === "ar" && l.name_ar) || l.name_en }));
  const cny = readRates(fx?.value).CNY;
  // "Reorder": start from an earlier China order; linked items bring their latest China price, CBM and pieces per carton
  const { from } = await searchParams;
  let lines: CnInitialLine[] = [];
  let src: { title: string | null; supplier_id: string | null; container: string | null; location_id: string } | null = null;
  if (from && /^[0-9a-f-]{36}$/i.test(from)) {
    const [{ data: o }, { data: ls }] = await Promise.all([
      db().from("purchase_orders").select("title, supplier_id, container, location_id").eq("id", from).eq("kind", "china").maybeSingle(),
      db().from("china_order_lines").select("*").eq("order_id", from).order("line_no"),
    ]);
    src = o ?? null;
    const vids = [...new Set((ls ?? []).map((l) => l.variant_id).filter(Boolean))] as string[];
    const { data: vs } = vids.length ? await db().from("variant_search").select("variant_id, product_id, sku, name_en, name_ar, option1, option2, image_url").in("variant_id", vids) : { data: [] };
    const pids = [...new Set((vs ?? []).map((v) => v.product_id))];
    const { data: ps } = pids.length ? await db().from("products").select("id, units_per_carton, carton_cbm, china_price, china_currency").in("id", pids) : { data: [] };
    const n = (x: unknown) => (x === null || x === undefined ? "" : String(Number(x)));
    lines = (ls ?? []).map((l) => {
      const v = vs?.find((x) => x.variant_id === l.variant_id);
      const p = v ? ps?.find((x) => x.id === v.product_id) : undefined;
      return {
        supplier_code: l.supplier_code ?? "", description: l.description ?? "", variant_id: l.variant_id, sku: v?.sku ?? null,
        name: v ? `${(locale === "ar" && v.name_ar) || v.name_en}${[v.option1, v.option2].filter(Boolean).length ? " · " + [v.option1, v.option2].filter(Boolean).join(" / ") : ""}` : null,
        image_url: l.image_url ?? v?.image_url ?? null, cartons: n(l.cartons),
        per_carton: p?.units_per_carton ? String(p.units_per_carton) : n(l.per_carton),
        unit_price: p?.china_price !== null && p?.china_price !== undefined && (p.china_currency ?? "CNY") === "CNY" ? n(p.china_price) : n(l.unit_price),
        carton_cbm: p?.carton_cbm ? n(p.carton_cbm) : n(l.carton_cbm),
      };
    });
  }
  return (
    <>
      <PageHeader title={t.cn.newOrder} t={t}><Link href="/purchasing/china" className="btn-ghost no-print">← {t.cn.title}</Link></PageHeader>
      <ChinaOrderForm t={t} locale={locale} suppliers={sups ?? []} locations={locations} editable usdRate={readRates(fx?.value).USD ?? 3.75}
        initial={{ id: "", poId: "", status: "draft", supplierId: src?.supplier_id ?? "", locationId: locations.find((l) => l.id === src?.location_id)?.id ?? locations[0]?.id ?? "",
          title: src?.title ? `${src.title} (${t.cn.reorder})` : "", container: src?.container ?? "40ft", rate: cny ? String(cny) : "", ratePaid: "", feeShipping: "", feeCustoms: "", feeOther: "", feeCurrency: "SAR", notes: "", lines }} />
    </>
  );
}
