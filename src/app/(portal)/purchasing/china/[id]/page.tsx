import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { ChinaOrderForm } from "@/components/ChinaOrderForm";
import { readRates } from "@/lib/fx";

export const dynamic = "force-dynamic";

/** One China order: change it until something is received; then open its purchase order to receive. */
export default async function ChinaOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const me = await requirePermission("purchasing.view");
  const { t, locale } = await getDict();
  const C = t.cn;
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: o } = await db().from("purchase_orders").select("*").eq("id", id).eq("kind", "china").maybeSingle();
  if (!o) notFound();
  const [{ data: ls }, { data: sups }, { data: locs }, { count }, { data: fx }] = await Promise.all([
    db().from("china_order_lines").select("*").eq("order_id", id).order("line_no"),
    db().from("suppliers").select("id, name").order("name"),
    db().from("locations").select("id, name_en, name_ar").eq("active", true).order("code"),
    db().from("purchase_receipts").select("id", { count: "exact", head: true }).eq("order_id", id),
    db().from("settings").select("value").eq("key", "fx_rates").maybeSingle(),
  ]);
  const vids = (ls ?? []).map((l) => l.variant_id).filter(Boolean) as string[];
  const { data: vs } = vids.length ? await db().from("variant_search").select("variant_id, sku, name_en, name_ar, option1, option2, image_url").in("variant_id", vids) : { data: [] };
  const v = (vid: string | null) => vs?.find((x) => x.variant_id === vid);
  const editable = me.perms.has("purchasing.edit") && ["draft", "ordered", "shipped"].includes(o.status) && !(count ?? 0);
  const locations = (locs ?? []).map((l) => ({ id: l.id, name: (locale === "ar" && l.name_ar) || l.name_en }));
  const n = (x: unknown) => (x === null || x === undefined ? "" : String(Number(x)));
  return (
    <>
      <PageHeader title={o.title || `${C.title} · PO-${o.po_no}`} subtitle={`PO-${o.po_no} · ${C.statuses[o.status as keyof typeof C.statuses] ?? o.status}`} t={t} filename={`china-${o.po_no}`}>
        <div className="no-print flex flex-wrap gap-2">
          <Link href="/purchasing/china" className="btn-ghost">← {C.title}</Link>
          <Link href={`/purchasing/${o.id}`} className="btn-ghost" data-testid="cn-open-po">{C.openPo}</Link>
          {me.perms.has("purchasing.edit") && <Link href={`/purchasing/china/new?from=${o.id}`} className="btn-ghost" data-testid="cn-reorder">↻ {C.reorder}</Link>}
        </div>
      </PageHeader>
      {sp.ok && <p className="alert-ok mb-4">{t.saved}</p>}
      <p className="mb-4 text-sm text-gray-500">{C.receiveHint}</p>
      <ChinaOrderForm t={t} locale={locale} suppliers={sups ?? []} locations={locations} editable={editable} usdRate={readRates(fx?.value).USD ?? 3.75}
        initial={{
          id: o.id, poId: o.id, status: o.status, supplierId: o.supplier_id ?? "", locationId: o.location_id, title: o.title ?? "", container: o.container ?? "",
          rate: n(o.rate), ratePaid: n(o.rate_paid), feeShipping: n(o.fee_shipping), feeCustoms: n(o.fee_customs), feeOther: n(o.fee_other), feeCurrency: o.fee_currency ?? "SAR", notes: o.notes ?? "",
          lines: (ls ?? []).map((l) => {
            const x = v(l.variant_id);
            return { supplier_code: l.supplier_code ?? "", description: l.description ?? "", variant_id: l.variant_id, sku: x?.sku ?? null,
              name: x ? `${(locale === "ar" && x.name_ar) || x.name_en}${[x.option1, x.option2].filter(Boolean).length ? " · " + [x.option1, x.option2].filter(Boolean).join(" / ") : ""}` : null,
              image_url: l.image_url ?? x?.image_url ?? null, cartons: n(l.cartons), per_carton: n(l.per_carton), unit_price: n(l.unit_price), carton_cbm: n(l.carton_cbm) };
          }),
        }} />
    </>
  );
}
