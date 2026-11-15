import Link from "next/link";
import { canUseLocation, requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { StockTabs } from "@/components/StockTabs";
import { RequestForm } from "@/components/RequestForm";
import { cancelRequestAction } from "@/app/actions/stock";

export const dynamic = "force-dynamic";

/** Restock requests: stores ask, the sender turns a request into a transfer. */
export default async function RequestsPage() {
  const me = await requirePermission("stock.requests");
  const { t, locale } = await getDict();
  const F = t.stock.flow;
  const { data: locs } = await db().from("locations").select("id, name_en, name_ar").eq("active", true).order("code");
  const name = (id: string | null) => { const l = locs?.find((x) => x.id === id); return l ? (locale === "ar" ? l.name_ar : l.name_en || l.name_ar) : F.anyStore; };
  const mine = (locs ?? []).filter((l) => me.locations === "all" || me.locations.includes(l.id));
  const { data: reqs } = await db().from("stock_requests").select("id, request_no, to_location_id, from_location_id, status, note, created_at, transfer_doc_id").order("created_at", { ascending: false }).limit(200);
  const ids = (reqs ?? []).map((r) => r.id);
  const { data: rl } = ids.length ? await db().from("stock_request_lines").select("request_id, qty").in("request_id", ids) : { data: [] };
  const visible = (reqs ?? []).filter((r) => me.locations === "all" || canUseLocation(me, r.to_location_id) || !r.from_location_id || canUseLocation(me, r.from_location_id));
  return (
    <>
      <PageHeader title={F.tabs.requests} t={t} filename="restock-requests">
        <Link href="/stock/requests/quick" className="btn-ghost no-print">{F.quick}</Link>
      </PageHeader>
      <StockTabs t={t} active="requests" canRequests />
      <RequestForm t={t} locale={locale} mine={mine.map((l) => ({ id: l.id, name: name(l.id) }))} all={(locs ?? []).map((l) => ({ id: l.id, name: name(l.id) }))} />
      <div className="card mt-6 overflow-hidden p-0"><div className="overflow-x-auto">
        <table className="table" data-export>
          <thead><tr><th>#</th><th>{F.forStore}</th><th>{F.fromStore}</th><th>{t.stock.lines}</th><th>{F.date}</th><th></th><th></th></tr></thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-gray-500">{F.none}</td></tr>}
            {visible.map((r) => {
              const lines = (rl ?? []).filter((x) => x.request_id === r.id);
              const canSend = r.status === "open" && me.perms.has("stock.transfer") && (r.from_location_id ? canUseLocation(me, r.from_location_id) : true);
              return (
                <tr key={r.id}>
                  <td className="cell-title" dir="ltr">#{r.request_no}</td>
                  <td data-label={F.forStore}>{name(r.to_location_id)}</td>
                  <td data-label={F.fromStore}>{name(r.from_location_id)}</td>
                  <td data-label={t.stock.lines}>{lines.length} · {lines.reduce((a, x) => a + Number(x.qty), 0)}{r.note && <div className="text-xs text-gray-500">{r.note}</div>}</td>
                  <td data-label={F.date} className="text-xs text-gray-500">{formatDateTime(new Date(r.created_at), locale)}</td>
                  <td data-label=""><span className={r.status === "open" ? "badge bg-amber-100 text-amber-800" : r.status === "converted" ? "badge-green" : "badge-gray"}>{F.reqStatus[r.status as keyof typeof F.reqStatus]}</span>
                    {r.transfer_doc_id && <Link href={`/stock/docs/${r.transfer_doc_id}`} className="ms-2 text-xs underline">{F.open}</Link>}</td>
                  <td className="no-print">
                    <div className="flex flex-wrap gap-2">
                      {canSend && <Link href={`/stock/new?kind=transfer&request=${r.id}`} className="btn-primary py-1.5">{F.makeTransfer}</Link>}
                      {r.status === "open" && <form action={cancelRequestAction}><input type="hidden" name="id" value={r.id} /><button className="btn-ghost py-1.5">{F.cancel}</button></form>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div></div>
    </>
  );
}
