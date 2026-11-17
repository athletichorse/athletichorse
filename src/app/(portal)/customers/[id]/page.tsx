import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { saveCustomerAction } from "@/app/actions/customers";
import { CustomerFields, customerError, type CustomerRow } from "@/components/CustomerFields";

export const dynamic = "force-dynamic";

/** Customer statement: on-account sales and refunds, payments received, running balance. */
export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requirePermission("customers.view");
  const { t, locale } = await getDict();
  const { id } = await params;
  const sp = await searchParams;
  const err = customerError(t, sp.err);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: c } = await db().from("customer_list").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const [{ data: st }, { data: inv }] = await Promise.all([
    db().from("customer_statement").select("at, kind, ref, invoice_id, amount").eq("customer_id", id).order("at"),
    db().from("sales_list").select("id, number, kind, issued_at, gross_total, methods").eq("customer_id", id).order("issued_at", { ascending: false }).limit(100),
  ]);
  const { data: details } = await db().from("customer_details").select("cr_number, addr_building, addr_street, addr_district, addr_city, addr_country, addr_postal, addr_additional").eq("customer_id", id).maybeSingle();
  const address = details ? [details.addr_building, details.addr_street, details.addr_district, details.addr_city, details.addr_postal, details.addr_additional && `${t.customers.additional.split(" (")[0]} ${details.addr_additional}`, details.addr_country].filter(Boolean).join("، ") : "";
  const X = t.pos.extra;
  const lines = (st ?? []).reduce<{ at: string; kind: string; ref: string; invoice_id: string | null; amount: string; balance: number }[]>(
    (acc, r) => [...acc, { ...r, balance: (acc.at(-1)?.balance ?? 0) + Number(r.amount) }], []);
  return (
    <>
      <PageHeader title={c.name || c.phone} subtitle={`#${c.customer_no} · ${c.phone}`} t={t} filename={`customer-${c.customer_no}`}>
        <Link href="/customers" className="btn-ghost no-print">← {t.customers.title}</Link>
      </PageHeader>
      {err && <p className="alert-err">{err}</p>}
      {sp.ok && <p className="alert-ok">{t.saved}</p>}
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <div className="card"><div className="text-xs text-gray-500">{X.balance}</div><div className="text-2xl font-semibold" dir="ltr">{Number(c.balance).toFixed(2)}</div></div>
        <div className="card"><div className="text-xs text-gray-500">{X.creditLimit}</div><div className="text-2xl font-semibold" dir="ltr">{c.credit_limit === null ? X.noLimit : Number(c.credit_limit).toFixed(2)}</div></div>
        <div className="card"><div className="text-xs text-gray-500">{X.usualDiscount}</div><div className="text-2xl font-semibold" dir="ltr">{Number(c.discount_pct)}%</div></div>
      </div>
      {(c.vat_number || details?.cr_number || address) && (
        <div className="card mb-4 grid gap-2 text-sm sm:grid-cols-3" data-testid="customer-business">
          {c.vat_number && <div><div className="text-xs text-gray-500">{t.customers.vat}</div><div dir="ltr" className="font-medium">{c.vat_number}</div></div>}
          {details?.cr_number && <div><div className="text-xs text-gray-500">{t.customers.cr}</div><div dir="ltr" className="font-medium">{details.cr_number}</div></div>}
          {address && <div className="sm:col-span-3"><div className="text-xs text-gray-500">{t.customers.nationalAddress}</div><div className="font-medium">{address}</div></div>}
        </div>
      )}
      {me.perms.has("customers.update") && (
        <form action={saveCustomerAction} id="edit" className="card no-print mb-6 scroll-mt-24">
          <h2 className="card-title">{t.customers.editCustomer}</h2>
          <CustomerFields t={t} c={{ ...(c as CustomerRow), details }} />
          <div className="mt-5 flex justify-end"><button className="btn-primary">{t.save}</button></div>
        </form>
      )}
      <section className="card mb-6 overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{t.customers.statement}</h2>
        <div className="overflow-x-auto"><table className="table" data-export>
          <thead><tr><th>{X.date}</th><th>{t.customers.entry}</th><th>{X.difference}</th><th>{X.balance}</th></tr></thead>
          <tbody>
            {lines.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-gray-500">{X.none}</td></tr>}
            {lines.map((r, i) => (
              <tr key={i}>
                <td className="cell-title text-xs">{formatDateTime(new Date(r.at), locale)}</td>
                <td data-label={t.customers.entry}>{r.kind === "payment" ? X.customerPayment : r.invoice_id ? <Link href={`/sales/${r.invoice_id}`} className="underline" dir="ltr">{r.ref}</Link> : r.ref}{r.kind === "payment" && r.ref ? ` · ${r.ref}` : ""}</td>
                <td data-label={X.difference} dir="ltr" className={Number(r.amount) < 0 ? "text-emerald-700" : ""}>{Number(r.amount).toFixed(2)}</td>
                <td data-label={X.balance} dir="ltr" className="font-semibold">{r.balance.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>
      {me.perms.has("sales.view") && (
        <section className="card overflow-hidden p-0">
          <h2 className="card-title px-5 pt-5">{X.invoices}</h2>
          <div className="overflow-x-auto"><table className="table">
            <tbody>
              {(inv ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="cell-title" dir="ltr"><Link href={`/sales/${r.id}`} className="underline">{r.number}</Link></td>
                  <td className="text-xs">{formatDateTime(new Date(r.issued_at), locale)}</td>
                  <td dir="ltr">{r.kind === "credit_note" ? "−" : ""}{Number(r.gross_total).toFixed(2)}</td>
                  <td className="text-xs text-gray-500">{r.methods}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      )}
    </>
  );
}
