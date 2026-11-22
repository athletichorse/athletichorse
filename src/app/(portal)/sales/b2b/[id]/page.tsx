import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { PendingButton } from "@/components/PendingButton";
import { B2bStatusButtons } from "@/components/B2bStatusButtons";
import { addB2bPaymentAction } from "@/app/actions/b2b";
import { B2B_METHODS, B2B_STATUSES, B2B_TONE, type B2bStatus } from "@/lib/purchasing";

export const dynamic = "force-dynamic";

/** One B2B order: stage (with the next steps), customer, items, totals and payments. Printable. */
export default async function B2bOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requirePermission("sales.b2b");
  const { t, locale } = await getDict();
  const B = t.b2b;
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: o } = await db().from("b2b_list").select("*").eq("id", id).maybeSingle();
  if (!o) notFound();
  const [{ data: ls }, { data: pays }, { data: loc }, { data: cust }] = await Promise.all([
    db().from("b2b_order_lines").select("line_no, variant_id, qty, unit_price, discount_pct, gross").eq("order_id", id).order("line_no"),
    db().from("b2b_payments").select("id, paid_on, amount, method, ref, created_at").eq("order_id", id).order("created_at"),
    db().from("locations").select("name_en, name_ar").eq("id", o.location_id).maybeSingle(),
    db().from("customers").select("id, vat_number").eq("id", o.customer_id).maybeSingle(),
  ]);
  const ids = (ls ?? []).map((l) => l.variant_id);
  const { data: vs } = ids.length ? await db().from("variant_search").select("variant_id, product_id, sku, option1, option2, option3, name_en, name_ar").in("variant_id", ids) : { data: [] };
  const v = (vid: string) => vs?.find((x) => x.variant_id === vid);
  const status = o.status as B2bStatus;
  const editable = ["new", "in_production", "ready"].includes(status);
  const err = sp.err ? (B.errors as Record<string, string>)[sp.err] ?? sp.err : null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  const m = (x: unknown) => Number(x ?? 0).toFixed(2);
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 border-b border-[var(--line)] py-1.5 text-sm last:border-0"><span className="text-gray-500">{label}</span><span className="text-end font-medium">{value}</span></div>
  );
  const stepIdx = B2B_STATUSES.indexOf(status);
  return (
    <>
      <PageHeader title={`${B.order} B2B-${o.order_no}`} subtitle={`${o.customer_name ?? ""} · ${formatDateTime(new Date(o.created_at), locale)}`} t={t} filename={`b2b-${o.order_no}`}>
        <div className="no-print flex flex-wrap gap-2">
          <Link href="/sales/b2b" className="btn-ghost">← {B.back}</Link>
          {editable && <Link href={`/sales/b2b/new?id=${o.id}`} className="btn-ghost">{B.edit}</Link>}
        </div>
      </PageHeader>
      {err && <p className="alert-err mb-4">{err}</p>}
      {sp.ok && <p className="alert-ok mb-4">{t.saved}</p>}

      <section className="card mb-4">
        <div className="mb-3 flex flex-wrap items-center gap-1 text-xs" data-testid="b2b-stage">
          {status === "cancelled" ? <span className={B2B_TONE.cancelled}>{B.statuses.cancelled}</span> :
            B2B_STATUSES.filter((s) => s !== "cancelled").map((s, i) => (
              <span key={s} className={i <= stepIdx ? B2B_TONE[s] : "badge border border-[var(--line)] text-gray-400"}>{i + 1}. {B.statuses[s]}</span>
            ))}
        </div>
        <B2bStatusButtons t={t} orderId={o.id} status={status} />
      </section>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <section className="card">
          {row(B.customer, <Link href={`/customers/${o.customer_id}`} className="underline">{o.customer_name || "—"}</Link>)}
          {row("#", <span dir="ltr">{o.customer_no} · {o.phone}</span>)}
          {cust?.vat_number && row(t.purchasing.vatNo, <span dir="ltr">{cust.vat_number}</span>)}
          {row(B.store, (locale === "ar" && loc?.name_ar) || loc?.name_en || "—")}
          {row(B.due, o.due_on ?? "—")}
          {o.customer_ref && row(B.customerRef, <span dir="ltr">{o.customer_ref}</span>)}
          {o.invoice_ref && row(B.invoiceRef, <span dir="ltr">{o.invoice_ref}</span>)}
          {o.notes && row(B.notes, o.notes)}
        </section>
        <section className="card" data-testid="b2b-money">
          {row(B.net, <span dir="ltr">{m(o.net_total)}</span>)}
          {row(`${B.vat} ${Number(o.vat_rate)}%`, <span dir="ltr">{m(o.vat_total)}</span>)}
          {row(B.total, <span dir="ltr">{m(o.gross_total)} SAR</span>)}
          {row(B.paid, <span dir="ltr">{m(o.paid)}</span>)}
          {row(B.due2, <span dir="ltr" className="text-[var(--brand)]">{status === "cancelled" ? "—" : m(o.due)}</span>)}
        </section>
      </div>

      <section className="card mb-4 overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{B.items} ({(ls ?? []).length})</h2>
        <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="b2b-lines">
          <thead><tr><th>{B.item}</th><th>SKU</th><th>{B.qty}</th><th>{B.price}</th><th>{B.discount}</th><th>{B.lineTotal}</th></tr></thead>
          <tbody>
            {(ls ?? []).map((l) => {
              const x = v(l.variant_id);
              const name = `${String((locale === "ar" && x?.name_ar) || x?.name_en || "")}${[x?.option1, x?.option2, x?.option3].filter(Boolean).length ? " · " + [x?.option1, x?.option2, x?.option3].filter(Boolean).join(" / ") : ""}`;
              return (
                <tr key={l.line_no}>
                  <td className="cell-title">{x?.product_id ? <Link href={`/products/${x.product_id}`} className="hover:text-[var(--brand)]">{name}</Link> : name}</td>
                  <td data-label="SKU" dir="ltr" className="font-mono text-xs">{x?.sku ?? "—"}</td>
                  <td data-label={B.qty} dir="ltr">{Number(l.qty)}</td>
                  <td data-label={B.price} dir="ltr">{m(l.unit_price)}</td>
                  <td data-label={B.discount} dir="ltr">{Number(l.discount_pct) ? `${Number(l.discount_pct)}%` : "—"}</td>
                  <td data-label={B.lineTotal} dir="ltr" className="font-semibold">{m(l.gross)}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </section>

      <section className="card overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{B.payments}</h2>
        {(pays ?? []).length === 0 ? <p className="px-5 pb-3 text-sm text-gray-500">{B.noPayments}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-testid="b2b-payments">
            <thead><tr><th>{B.paidOn}</th><th>{B.method}</th><th>{B.ref}</th><th>{B.amount}</th></tr></thead>
            <tbody>
              {(pays ?? []).map((p) => (
                <tr key={p.id}>
                  <td className="cell-title">{p.paid_on}</td>
                  <td data-label={B.method}>{B.methods[p.method as keyof typeof B.methods] ?? p.method}</td>
                  <td data-label={B.ref} dir="ltr">{p.ref || "—"}</td>
                  <td data-label={B.amount} dir="ltr" className="font-semibold">{m(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {status !== "cancelled" && Number(o.due) > 0 && (
          <form action={addB2bPaymentAction} className="no-print grid gap-3 border-t border-[var(--line)] p-5 sm:grid-cols-5" data-testid="b2b-pay">
            <input type="hidden" name="order_id" value={o.id} />
            <input type="hidden" name="client_id" value={crypto.randomUUID()} />
            <div><label className="label" htmlFor="bp-amount">{B.amount}</label><input id="bp-amount" name="amount" className="input" dir="ltr" inputMode="decimal" defaultValue={m(o.due)} required /></div>
            <div><label className="label" htmlFor="bp-on">{B.paidOn}</label><input id="bp-on" name="paid_on" type="date" className="input" defaultValue={today} /></div>
            <div><label className="label" htmlFor="bp-method">{B.method}</label>
              <select id="bp-method" name="method" className="input">{B2B_METHODS.map((x) => <option key={x} value={x}>{B.methods[x]}</option>)}</select></div>
            <div><label className="label" htmlFor="bp-ref">{B.ref}</label><input id="bp-ref" name="ref" className="input" dir="ltr" maxLength={60} /></div>
            <div className="flex items-end"><PendingButton label={B.addPayment} pendingLabel={B.saving} /></div>
          </form>
        )}
      </section>
    </>
  );
}
