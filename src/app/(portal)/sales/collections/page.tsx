import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { CollectionForm, type Candidate } from "@/components/CollectionForm";
import { codAmount } from "@/lib/order-follow";

export const dynamic = "force-dynamic";

/** Collections: cash-on-delivery money the shipping companies owe and pay, order by order. */
export default async function CollectionsPage() {
  await requirePermission("sales.website_orders");
  const { t, locale } = await getDict();
  const C = t.collections;
  const [{ data: orders }, { data: follow }, { data: done }, { data: cols }] = await Promise.all([
    db().from("web_orders").select("id, name, created_at, cancelled_at, financial_status, total").order("created_at", { ascending: false }).limit(5000),
    db().from("web_order_follow").select("order_id, status, courier, waybill"),
    db().from("courier_collection_lines").select("order_id, collection_id, expected, collected, fee"),
    db().from("courier_collections").select("id, courier, ref, received_on, method, received, fees, notes, created_at").order("received_on", { ascending: false }).order("created_at", { ascending: false }).limit(200),
  ]);
  const fmap = new Map((follow ?? []).map((f) => [f.order_id, f]));
  const collected = new Set((done ?? []).map((d) => d.order_id));
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });

  // waiting: given to a shipping company, money to collect, not collected yet
  const candidates: Candidate[] = (orders ?? []).flatMap((o) => {
    const f = fmap.get(o.id);
    const amount = codAmount(o);
    if (!f?.courier || collected.has(o.id) || o.cancelled_at || amount <= 0 || ["cancelled", "returned", "collected"].includes(f.status)) return [];
    return [{ id: o.id, name: o.name, courier: f.courier, waybill: f.waybill ?? "", expected: amount.toFixed(2), date: day(o.created_at) }];
  });
  const byCourier = new Map<string, { n: number; total: number }>();
  for (const c of candidates) { const x = byCourier.get(c.courier) ?? { n: 0, total: 0 }; x.n++; x.total += Number(c.expected); byCourier.set(c.courier, x); }
  const collectedWaybills = (orders ?? []).filter((o) => collected.has(o.id)).map((o) => fmap.get(o.id)?.waybill).filter(Boolean) as string[];
  const couriers = [...new Set([...candidates.map((c) => c.courier), ...(cols ?? []).map((c) => c.courier)])];
  const names = new Map((orders ?? []).map((o) => [o.id, o.name]));

  return (
    <>
      <PageHeader title={C.title} subtitle={C.subtitle} t={t} filename="collections" />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="waiting">
        {byCourier.size === 0 && <p className="card text-sm text-gray-500 sm:col-span-2 lg:col-span-4">{C.noneWaiting}</p>}
        {[...byCourier].map(([name, x]) => (
          <div key={name} className="card">
            <div className="text-sm text-gray-600">{name}</div>
            <div className="text-2xl font-semibold" dir="ltr">{x.total.toFixed(2)}</div>
            <div className="text-xs text-gray-500">{C.waitingOrders}: {x.n}</div>
          </div>
        ))}
      </div>

      <div className="mb-6"><CollectionForm t={t} candidates={candidates} collectedWaybills={collectedWaybills} couriers={couriers} /></div>

      <section className="card overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{C.history}</h2>
        {(cols ?? []).length === 0 ? <p className="px-5 pb-5 text-sm text-gray-500">{C.noHistory}</p> : (
          <div className="overflow-x-auto"><table className="table" data-export data-testid="collections-history">
            <thead><tr><th>{C.date}</th><th>{C.courier}</th><th>{C.ref}</th><th>{C.orders}</th><th>{C.collected}</th><th>{C.fees}</th><th>{C.net}</th><th>{C.method}</th></tr></thead>
            <tbody>
              {(cols ?? []).map((c) => {
                const ls = (done ?? []).filter((d) => d.collection_id === c.id);
                const gross = ls.reduce((a, l) => a + Number(l.collected), 0);
                return (
                  <tr key={c.id}>
                    <td className="cell-title text-sm">{c.received_on}<div className="text-xs text-gray-400">{formatDateTime(new Date(c.created_at), locale)}</div></td>
                    <td data-label={C.courier}>{c.courier}</td>
                    <td data-label={C.ref} dir="ltr">{c.ref || "—"}</td>
                    <td data-label={C.orders}>
                      <details><summary className="cursor-pointer">{ls.length}</summary>
                        <div className="mt-1 text-xs text-gray-600" dir="ltr">{ls.map((l) => `${names.get(l.order_id) ?? ""} ${Number(l.collected).toFixed(2)}`).join(" · ")}</div>
                      </details>
                    </td>
                    <td data-label={C.collected} dir="ltr">{gross.toFixed(2)}</td>
                    <td data-label={C.fees} dir="ltr">{Number(c.fees).toFixed(2)}</td>
                    <td data-label={C.net} dir="ltr" className="font-semibold">{Number(c.received).toFixed(2)}</td>
                    <td data-label={C.method}>{c.method === "cash" ? C.cash : C.bank}</td>
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
