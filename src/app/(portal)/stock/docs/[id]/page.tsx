import Link from "next/link";
import { notFound } from "next/navigation";
import { canUseLocation, requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { docNumber } from "@/lib/doc-number";
import { ReceiveTransfer } from "@/components/ReceiveTransfer";
import { viewableLocations } from "@/components/StockTabs";

export const dynamic = "force-dynamic";

/** One stock document with its lines and prices; an in-transit transfer can be received here. */
export default async function StockDocPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePermission("stock.view");
  const { t, locale } = await getDict();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: d } = await db().from("stock_doc_list").select("*").eq("id", id).maybeSingle();
  const { data: locs } = await db().from("locations").select("id, name_en, name_ar").order("code");
  const view = viewableLocations(locs ?? [], me).map((l) => l.id);
  if (!d || !(view.includes(d.location_id) || (d.to_location_id && view.includes(d.to_location_id)))) notFound();
  const { data: lines } = await db().from("stock_doc_lines").select("line_no, variant_id, qty, system_qty, received_qty, unit_price").eq("doc_id", id).order("line_no");
  const vids = (lines ?? []).map((l) => l.variant_id);
  const { data: vs } = vids.length ? await db().from("variant_prices").select("variant_id, sku, name_en, name_ar, option1, option2, option3").in("variant_id", vids) : { data: [] };
  const item = (vid: string) => { const v = vs?.find((x) => x.variant_id === vid); return { name: v ? String((locale === "ar" && v.name_ar) || v.name_en) : "—", options: v ? [v.option1, v.option2, v.option3].filter(Boolean).join(" / ") : "", sku: v?.sku ?? null }; };
  const lname = (lid: string | null) => { const l = locs?.find((x) => x.id === lid); return l ? (locale === "ar" ? l.name_ar : l.name_en || l.name_ar) : "—"; };
  const F = t.stock.flow;
  const isTransfer = d.kind === "transfer";
  const canReceive = isTransfer && d.status === "in_transit" && d.to_location_id && canUseLocation(me, d.to_location_id) && (me.perms.has("stock.transfer") || me.perms.has("stock.receive"));
  const kindName = d.kind === "transfer" ? t.stock.transfer : ((t.stock as Record<string, unknown>)[d.kind] as string);
  const rows = (lines ?? []).map((l) => ({ ...l, ...item(l.variant_id) }));
  return (
    <>
      <PageHeader title={`${kindName} ${docNumber(d.kind, d.doc_no)}`} subtitle={`${lname(d.location_id)}${d.to_location_id ? ` → ${lname(d.to_location_id)}` : ""} · ${formatDateTime(new Date(d.created_at), locale)}${d.created_by_name ? ` · ${d.created_by_name}` : ""}`} t={t} filename={`stock-${docNumber(d.kind, d.doc_no)}`}>
        <Link href="/stock/docs" className="btn-ghost no-print">← {F.tabs.docs}</Link>
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {isTransfer && <span className={d.status === "in_transit" ? "badge bg-amber-100 text-amber-800" : "badge-green"}>{F.status[d.status as keyof typeof F.status]}</span>}
        {d.reason && <span className="badge-gray">{F.reason}: {F.reasons[d.reason as keyof typeof F.reasons]}</span>}
        {d.note && <span className="text-gray-600">{d.note}</span>}
        {d.received_at && <span className="text-gray-500">{F.status.received}: {formatDateTime(new Date(d.received_at), locale)}{d.received_by_name ? ` · ${d.received_by_name}` : ""}</span>}
      </div>
      {canReceive ? (
        <ReceiveTransfer t={t} docId={d.id} lines={rows.map((r) => ({ lineNo: r.line_no, name: r.name, options: r.options, sku: r.sku, qty: String(Number(r.qty)), price: String(r.unit_price) }))} />
      ) : (
        <div className="card overflow-hidden p-0"><div className="overflow-x-auto">
          <table className="table" data-export>
            <thead><tr>
              <th>{t.stock.item}</th><th>SKU</th><th>{F.price}</th>
              {d.kind === "count" && <th>{F.systemQty}</th>}
              <th>{isTransfer ? F.sent : d.kind === "count" ? F.actualQty : t.stock.qty}</th>
              {d.kind === "count" && <th>{F.difference}</th>}
              {isTransfer && <th>{F.receivedQty}</th>}{isTransfer && <th>{F.shortage} / {F.extra}</th>}
              <th>{F.value}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const diff = r.received_qty === null ? null : Number(r.received_qty) - Number(r.qty);
                return (
                  <tr key={r.line_no}>
                    <td className="cell-title">{r.name}{r.options && <div className="text-xs text-gray-500">{r.options}</div>}</td>
                    <td data-label="SKU" className="font-mono text-xs" dir="ltr">{r.sku ?? "—"}</td>
                    <td data-label={F.price} dir="ltr">{Number(r.unit_price).toFixed(2)}</td>
                    {d.kind === "count" && <td data-label={F.systemQty}>{Number(r.system_qty)}</td>}
                    <td data-label={t.stock.qty} className="font-semibold">{Number(r.qty)}</td>
                    {d.kind === "count" && <td data-label={F.difference} className={Number(r.qty) - Number(r.system_qty) < 0 ? "text-red-600" : "text-emerald-700"}>{Number(r.qty) - Number(r.system_qty)}</td>}
                    {isTransfer && <td data-label={F.receivedQty}>{r.received_qty === null ? "—" : Number(r.received_qty)}</td>}
                    {isTransfer && <td data-label={F.shortage} className={diff && diff < 0 ? "text-red-600" : diff && diff > 0 ? "text-amber-700" : ""}>{diff === null || diff === 0 ? "—" : diff < 0 ? `${F.shortage} ${-diff}` : `${F.extra} ${diff}`}</td>}
                    <td data-label={F.value} dir="ltr">{(Number(r.qty) * Number(r.unit_price)).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td colSpan={2} className="font-semibold">{F.total}</td><td></td>{d.kind === "count" && <td></td>}<td className="font-semibold">{Number(d.total_qty)}</td>{d.kind === "count" && <td></td>}{isTransfer && <td></td>}{isTransfer && <td></td>}<td className="font-semibold" dir="ltr">{Number(d.value).toFixed(2)}</td></tr></tfoot>
          </table>
        </div></div>
      )}
    </>
  );
}
