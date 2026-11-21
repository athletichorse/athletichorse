import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { B2bOrderForm, type B2bInitial } from "@/components/B2bOrderForm";

export const dynamic = "force-dynamic";

/** New B2B order, or change one (?id=) before it is delivered. */
export default async function NewB2bPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const me = await requirePermission("sales.b2b");
  const { t, locale } = await getDict();
  const B = t.b2b;
  const sp = await searchParams;
  const [{ data: locs }, { data: vat }] = await Promise.all([
    db().from("locations").select("id, name_en, name_ar").eq("active", true).order("code"),
    db().from("settings").select("value").eq("key", "vat_rate").maybeSingle(),
  ]);
  const locations = (locs ?? []).filter((l) => me.locations === "all" || me.locations.includes(l.id)).map((l) => ({ id: l.id, name: (locale === "ar" && l.name_ar) || l.name_en }));
  let initial: B2bInitial | undefined;
  if (sp.id && /^[0-9a-f-]{36}$/i.test(sp.id)) {
    const { data: o } = await db().from("b2b_orders").select("*").eq("id", sp.id).maybeSingle();
    if (!o || !["new", "in_production", "ready"].includes(o.status)) redirect(`/sales/b2b/${sp.id}?err=locked`);
    const [{ data: c }, { data: ls }, { data: det }] = await Promise.all([
      db().from("customers").select("id, customer_no, name, phone").eq("id", o.customer_id).maybeSingle(),
      db().from("b2b_order_lines").select("line_no, variant_id, qty, unit_price, discount_pct").eq("order_id", o.id).order("line_no"),
      db().from("customer_details").select("price_level_id").eq("customer_id", o.customer_id).maybeSingle(),
    ]);
    const { data: lv } = det?.price_level_id ? await db().from("price_levels").select("id, name_en, name_ar").eq("id", det.price_level_id).maybeSingle() : { data: null };
    const ids = (ls ?? []).map((l) => l.variant_id);
    const { data: vs } = ids.length ? await db().from("variant_search").select("variant_id, sku, price, option1, option2, option3, name_en, name_ar").in("variant_id", ids) : { data: [] };
    initial = {
      id: o.id, locationId: o.location_id, dueOn: o.due_on ?? "", customerRef: o.customer_ref ?? "", notes: o.notes ?? "",
      customer: { id: c?.id ?? o.customer_id, customerNo: c?.customer_no ?? 0, name: c?.name ?? "", phone: c?.phone ?? "", levelId: lv?.id ?? null, levelName: lv ? (locale === "ar" && lv.name_ar) || lv.name_en : null },
      lines: (ls ?? []).map((l) => {
        const v = vs?.find((x) => x.variant_id === l.variant_id);
        return { variantId: l.variant_id, name: String((locale === "ar" && v?.name_ar) || v?.name_en || ""), options: [v?.option1, v?.option2, v?.option3].filter(Boolean).join(" / "), sku: v?.sku ?? null,
          qty: String(Number(l.qty)), price: Number(l.unit_price).toFixed(2), discount: Number(l.discount_pct) ? String(Number(l.discount_pct)) : "", listPrice: String(v?.price ?? "") };
      }),
    };
  }
  const vatRate = Number((vat?.value as string | undefined) ?? 15) || 15;
  return (
    <>
      <PageHeader title={initial ? B.editOrder : B.newOrder} t={t}>
        <div className="no-print"><Link href={initial ? `/sales/b2b/${initial.id}` : "/sales/b2b"} className="btn-ghost">← {B.back}</Link></div>
      </PageHeader>
      <B2bOrderForm t={t} locale={locale} locations={locations} vatRate={vatRate} initial={initial} />
    </>
  );
}
