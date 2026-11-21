import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { PendingButton } from "@/components/PendingButton";
import { ReceivePurchase } from "@/components/ReceivePurchase";
import { setPurchaseStatusAction } from "@/app/actions/purchasing";
import type { PoStatus } from "@/lib/purchasing";

export const dynamic = "force-dynamic";

/** One purchase order: items (ordered / received / left), receiving, and what was received so far. */
export default async function PurchasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requirePermission("purchasing.view");
  const { t, locale } = await getDict();
  const P = t.purchasing;
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: o } = await db().from("purchase_orders").select("*").eq("id", id).maybeSingle();
  if (!o) notFound();
  const [{ data: ls }, { data: sup }, { data: loc }, { data: rcs }] = await Promise.all([
    db().from("purchase_order_lines").select("line_no, variant_id, qty, unit_cost, received_qty").eq("order_id", id).order("line_no"),
    db().from("suppliers").select("id, name, factory").eq("id", o.supplier_id).maybeSingle(),
    db().from("locations").select("name_en, name_ar").eq("id", o.location_id).maybeSingle(),
    db().from("purchase_receipts").select("id, bill_no, received_on, amount, amount_sar, stock_doc_id, created_at").eq("order_id", id).order("created_at"),
  ]);
  const ids = (ls ?? []).map((l) => l.variant_id);
  const docIds = (rcs ?? []).map((r) => r.stock_doc_id).filter(Boolean) as string[];
  const [{ data: vs }, { data: docs }] = await Promise.all([
    ids.length ? db().from("variant_search").select("variant_id, product_id, sku, option1, option2, option3, name_en, name_ar").in("variant_id", ids) : Promise.resolve({ data: [] as { variant_id: string; product_id: string; sku: string | null; option1: string | null; option2: string | null; option3: string | null; name_en: string; name_ar: string }[] }),
    docIds.length ? db().from("stock_docs").select("id, doc_no").in("id", docIds) : Promise.resolve({ data: [] as { id: string; doc_no: number }[] }),
  ]);
  const v = (vid: string) => vs?.find((x) => x.variant_id === vid);
  const nameOf = (vid: string) => { const x = v(vid); return `${String((locale === "ar" && x?.name_ar) || x?.name_en || "")}${[x?.option1, x?.option2, x?.option3].filter(Boolean).length ? " · " + [x?.option1, x?.option2, x?.option3].filter(Boolean).join(" / ") : ""}`; };
  const status = o.status as PoStatus;
  const hasReceipts = (rcs ?? []).length > 0;
  const canEdit = me.perms.has("purchasing.edit") && ["draft", "ordered"].includes(status) && !hasReceipts;
  const canReceive = me.perms.has("purchasing.receive") && ["draft", "ordered", "partial"].includes(status) && (me.locations === "all" || me.locations.includes(o.location_id));
  const left = (ls ?? []).map((l) => ({ lineNo: l.line_no, name: nameOf(l.variant_id), sku: v(l.variant_id)?.sku ?? null, left: Number(l.qty) - Number(l.received_qty) })).filter((l) => l.left > 0);
  const err = sp.err ? (P.errors as Record<string, string>)[sp.err] ?? sp.err : null;
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 border-b border-[var(--line)] py-1.5 text-sm last:border-0"><span className="text-gray-500">{label}</span><span className="text-end font-medium">{value}</span></div>
  );
  return (
    <>
      <PageHeader title={`${P.order} PO-${o.po_no}`} subtitle={`${sup?.name ?? ""} · ${P.statuses[status]}`} t={t} filename={`po-${o.po_no}`}>
        <div className="no-print flex flex-wrap gap-2">
          <Link href="/purchasing" className="btn-ghost">← {P.back}</Link>
          {canEdit && <Link href={`/purchasing/new?id=${o.id}`} className="btn-ghost">{P.edit}</Link>}
          {canEdit && status === "draft" && (
            <form action={setPurchaseStatusAction}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value="ordered" /><PendingButton label={P.markOrdered} pendingLabel={P.saving} /></form>
          )}
          {canEdit && (
            <form action={setPurchaseStatusAction}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value="cancelled" />
              <details className="relative"><summary className="btn-ghost cursor-pointer list-none text-red-700">{P.cancelOrder}</summary>
                <div className="absolute end-0 z-10 mt-1 w-64 rounded-lg border border-[var(--line)] bg-white p-3 shadow-lg"><p className="mb-2 text-sm">{P.cancelSure}</p><PendingButton label={t.yes} pendingLabel={P.saving} className="btn-primary !bg-red-700" /></div>
              </details>
            </form>
          )}
        </div>
      </PageHeader>
      {err && <p className="alert-err mb-4">{err}</p>}
      {sp.ok && <p className="alert-ok mb-4">{t.saved}</p>}
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <section className="card">
          {row(P.supplier, sup ? <Link href={`/purchasing/suppliers/${sup.id}`} className="underline">{sup.name}</Link> : "—")}
          {sup?.factory && row(P.factory, sup.factory)}
          {row(P.store, (locale === "ar" && loc?.name_ar) || loc?.name_en || "—")}
          {row(P.status, P.statuses[status])}
        </section>
        <section className="card">
          {row(P.currency, `${o.currency}${o.currency !== "SAR" ? ` · 1 = ${Number(o.rate)} SAR` : ""}`)}
          {row(P.total, <span dir="ltr">{Number(o.total).toFixed(2)} {o.currency}</span>)}
          {o.currency !== "SAR" && row(P.totalSar, <span dir="ltr">{(Number(o.total) * Number(o.rate)).toFixed(2)} SAR</span>)}
          {row(P.expected, o.expected_on ?? "—")}
          {o.supplier_ref && row(P.supplierRef, <span dir="ltr">{o.supplier_ref}</span>)}
          {o.notes && row(P.notes, o.notes)}
        </section>
      </div>
      <section className="card mb-4 overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{P.items} ({(ls ?? []).length})</h2>
        <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="po-lines">
          <thead><tr><th>{P.item}</th><th>SKU</th><th>{P.qty}</th><th>{P.received}</th><th>{P.unitCost}</th><th>{P.lineTotal}</th></tr></thead>
          <tbody>
            {(ls ?? []).map((l) => (
              <tr key={l.line_no}>
                <td className="cell-title">{v(l.variant_id)?.product_id ? <Link href={`/products/${v(l.variant_id)?.product_id}`} className="hover:text-[var(--brand)]">{nameOf(l.variant_id)}</Link> : nameOf(l.variant_id)}</td>
                <td data-label="SKU" dir="ltr" className="font-mono text-xs">{v(l.variant_id)?.sku ?? "—"}</td>
                <td data-label={P.qty} dir="ltr">{Number(l.qty)}</td>
                <td data-label={P.received} dir="ltr">{Number(l.received_qty)}</td>
                <td data-label={P.unitCost} dir="ltr">{Number(l.unit_cost).toFixed(2)}</td>
                <td data-label={P.lineTotal} dir="ltr" className="font-semibold">{(Number(l.qty) * Number(l.unit_cost)).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>
      {canReceive && left.length > 0 && <div className="no-print mb-4"><ReceivePurchase t={t} orderId={o.id} lines={left} /></div>}
      <section className="card overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{P.receipts}</h2>
        {!hasReceipts ? <p className="px-5 pb-5 text-sm text-gray-500">{P.noReceipts}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-testid="po-receipts">
            <thead><tr><th>{P.receivedOn}</th><th>{P.billNo}</th><th>{P.stockDoc}</th><th>{P.amount}</th><th>{P.amountSar}</th></tr></thead>
            <tbody>
              {(rcs ?? []).map((r) => {
                const d = docs?.find((x) => x.id === r.stock_doc_id);
                return (
                  <tr key={r.id}>
                    <td className="cell-title">{r.received_on}</td>
                    <td data-label={P.billNo} dir="ltr">{r.bill_no || "—"}</td>
                    <td data-label={P.stockDoc}>{d ? <Link href={`/stock/docs/${d.id}`} className="underline" dir="ltr">{d.doc_no}</Link> : "—"}</td>
                    <td data-label={P.amount} dir="ltr">{Number(r.amount).toFixed(2)} {o.currency}</td>
                    <td data-label={P.amountSar} dir="ltr">{Number(r.amount_sar).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
