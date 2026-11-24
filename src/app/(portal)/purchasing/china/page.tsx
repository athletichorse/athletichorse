import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { CN_CONTAINERS } from "@/lib/china";

export const dynamic = "force-dynamic";

/** China (container) orders: each with its container fill, status and total landed cost. */
export default async function ChinaOrders() {
  const me = await requirePermission("purchasing.view");
  const { t } = await getDict();
  const C = t.cn;
  const [{ data: orders }, { data: sups }] = await Promise.all([
    db().from("purchase_orders").select("id, po_no, title, supplier_id, container, status, total, rate, rate_paid, fee_shipping, fee_customs, fee_other, created_at").eq("kind", "china").order("po_no", { ascending: false }).limit(500),
    db().from("suppliers").select("id, name"),
  ]);
  const ids = (orders ?? []).map((o) => o.id);
  const { data: ls } = ids.length ? await db().from("china_order_lines").select("order_id, cartons, carton_cbm").in("order_id", ids) : { data: [] };
  const cbm = (id: string) => Math.round((ls ?? []).filter((l) => l.order_id === id).reduce((a, l) => a + Number(l.cartons) * Number(l.carton_cbm), 0) * 100) / 100;
  const f = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return (
    <>
      <PageHeader title={C.title} subtitle={C.subtitle} t={t} filename="china-orders">
        {me.perms.has("purchasing.edit") && <Link href="/purchasing/china/new" className="btn-primary no-print" data-testid="new-cn">+ {C.newOrder}</Link>}
      </PageHeader>
      <section className="card overflow-hidden p-0">
        {(orders ?? []).length === 0 ? <p className="p-5 text-sm text-gray-500">{C.none}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="cn-table">
            <thead><tr><th>{C.name}</th><th>{C.status}</th><th>{C.container}</th><th>CBM</th><th>{C.total}</th></tr></thead>
            <tbody>
              {(orders ?? []).map((o) => {
                const cap = CN_CONTAINERS.find((c) => c.key === o.container)?.cbm;
                const c = cbm(o.id);
                const total = Number(o.total) * Number(o.rate_paid ?? o.rate) + Number(o.fee_shipping) + Number(o.fee_customs) + Number(o.fee_other);
                return (
                  <tr key={o.id} data-cn={o.title ?? ""}>
                    <td className="cell-title"><Link href={`/purchasing/china/${o.id}`} className="font-medium underline">{o.title || `PO-${o.po_no}`}</Link>
                      <div className="text-xs text-gray-400"><span dir="ltr">PO-{o.po_no}</span>{o.supplier_id && ` · ${sups?.find((s) => s.id === o.supplier_id)?.name ?? ""}`}</div></td>
                    <td data-label={C.status}>{C.statuses[o.status as keyof typeof C.statuses] ?? o.status}</td>
                    <td data-label={C.container} dir="ltr">{o.container ?? "—"}</td>
                    <td data-label="CBM" dir="ltr">{c}{cap ? ` / ${cap} (${Math.round((c / cap) * 1000) / 10}%)` : ""}</td>
                    <td data-label={C.total} dir="ltr" className="font-semibold">{f(total)} SAR</td>
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
