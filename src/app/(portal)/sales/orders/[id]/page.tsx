import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { WebsiteOrderButtons } from "@/components/WebsiteOrderButtons";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { codAmount, type FollowStatus } from "@/lib/order-follow";

export const dynamic = "force-dynamic";

/** One website order: customer, address, items, totals, follow-up and collection — inside the portal. */
export default async function WebOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePermission("sales.website_orders");
  const { t, locale } = await getDict();
  const O = t.orders, D = t.orders.detail;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: o } = await db().from("web_orders").select("*").eq("id", id).maybeSingle();
  if (!o) notFound();
  const [{ data: lines }, { data: f }, { data: col }] = await Promise.all([
    db().from("web_order_lines").select("name, sku, qty, current_qty, unit_price, line_total, variant_id").eq("order_id", id),
    db().from("web_order_follow").select("status, courier, waybill, size, branch_id, notes, updated_at").eq("order_id", id).maybeSingle(),
    db().from("courier_collection_lines").select("collected, fee, collection_id").eq("order_id", id).maybeSingle(),
  ]);
  const [{ data: branch }, { data: collection }, { data: variants }] = await Promise.all([
    f?.branch_id ? db().from("locations").select("name_en, name_ar").eq("id", f.branch_id).maybeSingle() : Promise.resolve({ data: null }),
    col ? db().from("courier_collections").select("courier, ref, received_on").eq("id", col.collection_id).maybeSingle() : Promise.resolve({ data: null }),
    (lines ?? []).some((l) => l.variant_id) ? db().from("product_variants").select("id, product_id").in("id", (lines ?? []).map((l) => l.variant_id).filter(Boolean) as string[]) : Promise.resolve({ data: [] as { id: string; product_id: string }[] }),
  ]);
  const status = (f?.status ?? (o.cancelled_at ? "cancelled" : "new")) as FollowStatus;
  const store = (process.env.SHOPIFY_STORE ?? "").replace(/\.myshopify\.com.*$/, "").replace(/^https?:\/\//, "");
  const shopifyUrl = store && /^[a-z0-9-]+$/.test(store) ? `https://admin.shopify.com/store/${store}/orders/${o.shopify_order_id}` : null;
  const canEdit = me.perms.has("sales.website_orders_edit");
  const m = (v: unknown) => Number(v ?? 0).toFixed(2);
  const productOf = (vid: string | null) => variants?.find((v) => v.id === vid)?.product_id;
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 border-b border-[var(--line)] py-1.5 text-sm last:border-0"><span className="text-gray-500">{label}</span><span className="text-end font-medium">{value}</span></div>
  );
  return (
    <>
      <PageHeader title={`${D.title} ${o.name}`} subtitle={formatDateTime(new Date(o.created_at), locale)} t={t} filename={`order-${o.name.replace("#", "")}`}>
        <div className="no-print flex flex-wrap gap-2">
          <Link href="/sales/orders" className="btn-ghost">← {O.title}</Link>
          {shopifyUrl && <a href={shopifyUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost" data-testid="open-shopify">{D.openWebsite} ↗</a>}
        </div>
      </PageHeader>
      {canEdit && (
        <WebsiteOrderButtons
          t={t}
          orderId={o.id}
          hasWaybill={Boolean(f?.waybill)}
          show={{
            ship: !o.cancelled_at && ["unfulfilled", "partially_fulfilled", "on_hold", "scheduled", "in_progress", "open"].includes(String(o.fulfillment_status || "unfulfilled")),
            paid: !o.cancelled_at && ["pending", "partially_paid", "authorized"].includes(String(o.financial_status ?? "")),
            cancel: !o.cancelled_at,
          }}
        />
      )}
      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <section className="card">
          <h2 className="card-title">{D.customer}</h2>
          {row(D.name, o.customer_id ? <Link href={`/customers/${o.customer_id}`} className="underline">{o.customer_name || "—"}</Link> : o.customer_name || "—")}
          {row(D.phone, <span dir="ltr">{o.phone || "—"}</span>)}
          {row(D.email, <span dir="ltr">{o.email || "—"}</span>)}
          {row(O.address, [o.province, o.city].filter(Boolean).join(" - ") || "—")}
          {o.address && row(D.street, o.address)}
        </section>
        <section className="card">
          <h2 className="card-title">{D.followUp}</h2>
          {row(O.status, O.statuses[status])}
          {row(O.web, `${O.webStatuses[(o.cancelled_at ? "cancelled" : ["unfulfilled", "fulfilled", "partially_fulfilled", "on_hold"].includes(o.fulfillment_status) ? o.fulfillment_status : "other") as keyof typeof O.webStatuses]} · ${o.financial_status || "—"}`)}
          {row(O.courier, f?.courier || "—")}
          {row(O.waybill, <span dir="ltr">{f?.waybill || "—"}</span>)}
          {row(O.size, O.sizes[(f?.size ?? "normal") as "normal" | "bulky"])}
          {row(O.branch, branch ? (locale === "ar" && branch.name_ar) || branch.name_en : "—")}
          {f?.notes && row(O.notes, f.notes)}
        </section>
        <section className="card">
          <h2 className="card-title">{D.money}</h2>
          {row(D.subtotal, m(o.subtotal))}
          {row(D.shipping, m(o.shipping))}
          {Number(o.discounts) > 0 && row(D.discounts, `− ${m(o.discounts)}`)}
          {row(D.tax, m(o.tax))}
          {row(D.total, <span dir="ltr">{m(o.total)} {o.currency}</span>)}
          {row(O.amount, <span dir="ltr" className="text-[var(--brand)]">{codAmount(o).toFixed(2)}</span>)}
          {col ? row(D.collected, `${m(col.collected)} − ${m(col.fee)} · ${collection?.courier ?? ""} ${collection?.ref ?? ""} · ${collection?.received_on ?? ""}`) : row(D.collected, D.notYet)}
        </section>
      </div>
      <section className="card overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{D.items} ({(lines ?? []).length})</h2>
        <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="order-items">
          <thead><tr><th>{D.item}</th><th>SKU</th><th>{D.qty}</th><th>{D.unitPrice}</th><th>{D.lineTotal}</th></tr></thead>
          <tbody>
            {(lines ?? []).map((l, i) => {
              const pid = productOf(l.variant_id);
              return (
                <tr key={i}>
                  <td className="cell-title">{pid ? <Link href={`/products/${pid}`} className="hover:text-[var(--brand)]">{l.name}</Link> : l.name}</td>
                  <td data-label="SKU" dir="ltr" className="font-mono text-xs">{l.sku || "—"}</td>
                  <td data-label={D.qty}>{Number(l.current_qty)}{Number(l.current_qty) !== Number(l.qty) && <span className="ms-1 text-xs text-gray-400 line-through">{Number(l.qty)}</span>}</td>
                  <td data-label={D.unitPrice} dir="ltr">{m(l.unit_price)}</td>
                  <td data-label={D.lineTotal} dir="ltr" className="font-semibold">{m(l.line_total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </section>
    </>
  );
}
