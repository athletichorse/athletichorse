import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { PendingButton } from "@/components/PendingButton";
import { addSupplierPaymentAction, saveSupplierAction } from "@/app/actions/purchasing";
import { SUPPLIER_METHODS, withRunning, type PoStatus } from "@/lib/purchasing";
import { SupplierFields } from "../SupplierFields";

export const dynamic = "force-dynamic";

/** One supplier: details, statement (goods received, payments, balance), orders, and paying them. */
export default async function SupplierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requirePermission("purchasing.view");
  const { t } = await getDict();
  const P = t.purchasing;
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: s } = await db().from("supplier_list").select("*").eq("id", id).maybeSingle();
  if (!s) notFound();
  const [{ data: st }, { data: orders }] = await Promise.all([
    db().from("supplier_statement").select("on_date, created_at, kind, order_id, ref, currency, amount, amount_sar").eq("supplier_id", id).order("on_date").order("created_at"),
    db().from("purchase_orders").select("id, po_no, status, total, currency, created_at").eq("supplier_id", id).order("po_no", { ascending: false }).limit(100),
  ]);
  const poNo = new Map((orders ?? []).map((o) => [o.id, o.po_no]));
  const lines = withRunning((st ?? []).map((r) => ({ ...r, inCurrency: Number(r.amount), amount: Number(r.amount_sar) })));
  const err = sp.err ? (P.errors as Record<string, string>)[sp.err] ?? sp.err : null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  return (
    <>
      <PageHeader title={s.name} subtitle={`${P.balance}: ${Number(s.balance).toFixed(2)} ${s.currency} · ${P.balanceSar}: ${Number(s.balance_sar).toFixed(2)}`} t={t} filename={`supplier-${s.supplier_no}`}>
        <div className="no-print flex flex-wrap gap-2">
          <Link href="/purchasing/suppliers" className="btn-ghost">← {P.suppliers}</Link>
          {me.perms.has("purchasing.edit") && s.active && <Link href={`/purchasing/new?supplier=${s.id}`} className="btn-primary">+ {P.newOrder}</Link>}
        </div>
      </PageHeader>
      {err && <p className="alert-err mb-4">{err}</p>}
      {sp.ok && <p className="alert-ok mb-4">{t.saved}</p>}

      {me.perms.has("purchasing.pay") && (
        <section className="card no-print mb-4">
          <h2 className="card-title">{P.addPayment}</h2>
          <form action={addSupplierPaymentAction} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="supplier-pay">
            <input type="hidden" name="supplier_id" value={s.id} />
            <input type="hidden" name="client_id" value={crypto.randomUUID()} />
            <div><label className="label" htmlFor="pay-amount">{P.amount}</label><input id="pay-amount" name="amount" className="input" dir="ltr" inputMode="decimal" required /></div>
            <div><label className="label" htmlFor="pay-cur">{P.currency}</label><input id="pay-cur" name="currency" className="input" dir="ltr" maxLength={3} defaultValue={s.currency} required /></div>
            <div><label className="label" htmlFor="pay-rate">{P.rate}</label><input id="pay-rate" name="rate" className="input" dir="ltr" inputMode="decimal" defaultValue={s.currency === "SAR" ? "1" : ""} /></div>
            <div><label className="label" htmlFor="pay-on">{P.paidOn}</label><input id="pay-on" name="paid_on" type="date" className="input" defaultValue={today} /></div>
            <div><label className="label" htmlFor="pay-method">{P.method}</label>
              <select id="pay-method" name="method" className="input">{SUPPLIER_METHODS.map((m) => <option key={m} value={m}>{P.methods[m]}</option>)}</select></div>
            <div><label className="label" htmlFor="pay-ref">{P.ref}</label><input id="pay-ref" name="ref" className="input" dir="ltr" maxLength={60} /></div>
            <div className="sm:col-span-3 lg:col-span-5"><label className="label" htmlFor="pay-note">{P.note}</label><input id="pay-note" name="note" className="input" maxLength={500} /></div>
            <div className="flex items-end"><PendingButton label={P.addPayment} pendingLabel={P.saving} /></div>
          </form>
        </section>
      )}

      <section className="card mb-4 overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{P.statement}</h2>
        {lines.length === 0 ? <p className="px-5 pb-5 text-sm text-gray-500">{P.noReceipts}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="supplier-statement">
            <thead><tr><th>{P.date}</th><th>{P.entry}</th><th>{P.amount}</th><th>{P.amountSar}</th><th>{P.runBal}</th></tr></thead>
            <tbody>
              {lines.map((r, i) => (
                <tr key={i}>
                  <td className="cell-title">{r.on_date}</td>
                  <td data-label={P.entry}>
                    {r.kind === "receipt" ? P.receiptEntry : P.paymentEntry}
                    {r.order_id && poNo.get(r.order_id) && <> · <Link href={`/purchasing/${r.order_id}`} className="underline" dir="ltr">PO-{poNo.get(r.order_id)}</Link></>}
                    {r.ref && <span className="text-gray-500" dir="ltr"> · {r.ref}</span>}
                  </td>
                  <td data-label={P.amount} dir="ltr">{r.inCurrency.toFixed(2)} {r.currency}</td>
                  <td data-label={P.amountSar} dir="ltr">{r.amount.toFixed(2)}</td>
                  <td data-label={P.runBal} dir="ltr" className="font-semibold">{r.balance.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      <section className="card mb-4 overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{P.orders}</h2>
        {(orders ?? []).length === 0 ? <p className="px-5 pb-5 text-sm text-gray-500">{P.none}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact">
            <thead><tr><th>{P.order}</th><th>{P.status}</th><th>{P.total}</th></tr></thead>
            <tbody>
              {(orders ?? []).map((o) => (
                <tr key={o.id}>
                  <td className="cell-title"><Link href={`/purchasing/${o.id}`} className="underline" dir="ltr">PO-{o.po_no}</Link></td>
                  <td data-label={P.status}>{P.statuses[o.status as PoStatus]}</td>
                  <td data-label={P.total} dir="ltr">{Number(o.total).toFixed(2)} {o.currency}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      {me.perms.has("purchasing.edit") && (
        <details className="card no-print">
          <summary className="cursor-pointer font-semibold">{t.edit}</summary>
          <form action={saveSupplierAction} className="mt-4 space-y-4">
            <input type="hidden" name="id" value={s.id} />
            <SupplierFields t={t} s={s} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={s.active} /> {P.active}</label>
            <div className="flex justify-end"><PendingButton label={P.save} pendingLabel={P.saving} /></div>
          </form>
        </details>
      )}
    </>
  );
}
