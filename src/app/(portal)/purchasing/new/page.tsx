import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { PurchaseOrderForm, type PoInitial } from "@/components/PurchaseOrderForm";

export const dynamic = "force-dynamic";

/** New purchase order, or change one (?id=) while nothing has been received. */
export default async function NewPurchasePage({ searchParams }: { searchParams: Promise<{ id?: string; supplier?: string }> }) {
  await requirePermission("purchasing.view");
  const me = await requirePermission("purchasing.edit");
  const { t, locale } = await getDict();
  const P = t.purchasing;
  const sp = await searchParams;
  const [{ data: sups }, { data: locs }] = await Promise.all([
    db().from("suppliers").select("id, name, currency, active").order("name"),
    db().from("locations").select("id, name_en, name_ar").eq("active", true).order("code"),
  ]);
  const locations = (locs ?? []).filter((l) => me.locations === "all" || me.locations.includes(l.id)).map((l) => ({ id: l.id, name: (locale === "ar" && l.name_ar) || l.name_en }));
  let initial: PoInitial | undefined;
  if (sp.id && /^[0-9a-f-]{36}$/i.test(sp.id)) {
    const { data: o } = await db().from("purchase_orders").select("*").eq("id", sp.id).maybeSingle();
    const { count } = await db().from("purchase_receipts").select("id", { count: "exact", head: true }).eq("order_id", sp.id);
    if (o?.kind === "china") redirect(`/purchasing/china/${sp.id}`);
    if (!o || !["draft", "ordered"].includes(o.status) || (count ?? 0) > 0) redirect(`/purchasing/${sp.id}?err=locked`);
    const { data: ls } = await db().from("purchase_order_lines").select("line_no, variant_id, qty, unit_cost").eq("order_id", o.id).order("line_no");
    const ids = (ls ?? []).map((l) => l.variant_id);
    const { data: vs } = ids.length ? await db().from("variant_search").select("variant_id, sku, price, option1, option2, option3, name_en, name_ar").in("variant_id", ids) : { data: [] };
    initial = {
      id: o.id, supplierId: o.supplier_id, locationId: o.location_id, currency: o.currency, rate: String(Number(o.rate)), expectedOn: o.expected_on ?? "", supplierRef: o.supplier_ref ?? "", notes: o.notes ?? "",
      lines: (ls ?? []).map((l) => {
        const v = vs?.find((x) => x.variant_id === l.variant_id);
        return { variantId: l.variant_id, name: String((locale === "ar" && v?.name_ar) || v?.name_en || ""), options: [v?.option1, v?.option2, v?.option3].filter(Boolean).join(" / "), sku: v?.sku ?? null, qty: String(Number(l.qty)), price: String(Number(l.unit_cost)), discount: "", listPrice: String(v?.price ?? "") };
      }),
    };
  }
  const suppliers = (sups ?? []).filter((s) => s.active || s.id === initial?.supplierId).map((s) => ({ id: s.id, name: s.name, currency: s.currency }));
  return (
    <>
      <PageHeader title={initial ? P.editOrder : P.newOrder} t={t}>
        <div className="no-print flex gap-2">
          <Link href={initial ? `/purchasing/${initial.id}` : "/purchasing"} className="btn-ghost">← {P.back}</Link>
          {!suppliers.length && <Link href="/purchasing/suppliers" className="btn-primary">+ {P.newSupplier}</Link>}
        </div>
      </PageHeader>
      <PurchaseOrderForm t={t} locale={locale} suppliers={suppliers} locations={locations} initial={initial} defaultSupplier={sp.supplier} />
    </>
  );
}
