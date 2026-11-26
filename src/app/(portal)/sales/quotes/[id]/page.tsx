import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { canUseLocation, requireStaff } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { AutoPrint } from "@/components/AutoPrint";

export const dynamic = "force-dynamic";

/** One quotation (price offer) with a picture of each item. Print, PDF or Excel from the menu; ?print=1 opens the A4 print. */
export default async function QuotationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const me = await requireStaff();
  if (!me.perms.has("sales.view") && !me.perms.has("pos.desk")) redirect("/forbidden?k=sales.view");
  const { t, locale } = await getDict();
  const Q = t.sales.quote;
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: q } = await db().from("quotations").select("*").eq("id", id).maybeSingle();
  if (!q || (!me.perms.has("sales.view_all_branches") && !canUseLocation(me, q.location_id))) notFound();
  const [{ data: ls }, { data: loc }, { data: cust }, { data: people }] = await Promise.all([
    db().from("quotation_lines").select("line_no, variant_id, qty, unit_price, discount, active").eq("quotation_id", id).order("line_no"),
    db().from("locations").select("name_en, name_ar").eq("id", q.location_id).maybeSingle(),
    q.customer_id ? db().from("customers").select("name, phone, customer_no, vat_number").eq("id", q.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    db().from("profiles").select("id, full_name").in("id", [q.created_by, q.salesperson_id].filter(Boolean)),
  ]);
  const lines = (ls ?? []).filter((l) => l.active !== false);
  const ids = lines.map((l) => l.variant_id);
  const { data: vs } = ids.length ? await db().from("variant_search").select("variant_id, product_id, sku, option1, option2, option3, name_en, name_ar, image_url").in("variant_id", ids) : { data: [] };
  const v = (vid: string) => vs?.find((x) => x.variant_id === vid);
  const m = (x: unknown) => Number(x ?? 0).toFixed(2);
  const who = (pid: string | null) => people?.find((x) => x.id === pid)?.full_name ?? "—";
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 border-b border-[var(--line)] py-1.5 text-sm last:border-0"><span className="text-gray-500">{label}</span><span className="text-end font-medium">{value}</span></div>
  );
  return (
    <>
      <PageHeader title={`${Q.title} #${q.quote_no}`} subtitle={formatDateTime(new Date(q.created_at), locale)} t={t} filename={`quotation-${q.quote_no}`}>
        <Link href="/sales?tab=quotes" className="btn-ghost no-print">← {t.sales.quotes}</Link>
      </PageHeader>
      {sp.print && <AutoPrint mode="a4" />}
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <section className="card">
          {row(t.sales.customer, cust ? <span>{cust.name || "—"} <span dir="ltr" className="text-gray-500">{cust.phone}</span></span> : "—")}
          {cust?.vat_number && row(t.purchasing.vatNo, <span dir="ltr">{cust.vat_number}</span>)}
          {row(t.sales.branch, (locale === "ar" && loc?.name_ar) || loc?.name_en || "—")}
          {row(Q.salesperson, who(q.salesperson_id ?? q.created_by))}
          {row(t.sales.status, <span className={q.status === "open" ? "badge-blue" : q.status === "collected" ? "badge-green" : "badge-gray"}>{Q.statuses[q.status as keyof typeof Q.statuses] ?? q.status}</span>)}
        </section>
        <section className="card" data-testid="quote-money">
          {row(Q.net, <span dir="ltr">{m(q.net_total)}</span>)}
          {row(t.sales.vat, <span dir="ltr">{m(q.vat_total)}</span>)}
          {row(t.sales.total, <span dir="ltr" className="text-[var(--brand)]">{m(q.gross_total)} SAR</span>)}
        </section>
      </div>
      <section className="card overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{t.sales.items} ({lines.length})</h2>
        <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="quote-lines">
          <thead><tr><th>{Q.picture}</th><th>{Q.item}</th><th>SKU</th><th>{Q.qty}</th><th>{Q.price}</th><th>{Q.discount}</th><th>{t.sales.total}</th></tr></thead>
          <tbody>
            {lines.map((l) => {
              const x = v(l.variant_id);
              const opts = [x?.option1, x?.option2, x?.option3].filter(Boolean).join(" / ");
              const name = String((locale === "ar" && x?.name_ar) || x?.name_en || "");
              const total = Number(l.unit_price) * Number(l.qty) - Number(l.discount);
              return (
                <tr key={l.line_no}>
                  <td className="cell-media">
                    {x?.image_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={x.image_url} alt={name} loading="eager" className="h-16 w-16 rounded border border-[var(--line)] bg-white object-contain" data-testid="quote-picture" />
                      : <div className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-[var(--line)] text-xs text-gray-400">—</div>}
                  </td>
                  <td className="cell-title">{name}{opts && <div className="text-xs font-normal text-gray-500">{opts}</div>}</td>
                  <td data-label="SKU" dir="ltr" className="font-mono text-xs">{x?.sku ?? "—"}</td>
                  <td data-label={Q.qty} dir="ltr">{Number(l.qty)}</td>
                  <td data-label={Q.price} dir="ltr">{m(l.unit_price)}</td>
                  <td data-label={Q.discount} dir="ltr">{Number(l.discount) ? m(l.discount) : "—"}</td>
                  <td data-label={t.sales.total} dir="ltr" className="font-semibold">{m(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </section>
      <p className="hint mt-3">{Q.note}</p>
    </>
  );
}
