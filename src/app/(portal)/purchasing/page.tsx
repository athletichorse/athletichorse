import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { PO_STATUSES, type PoStatus } from "@/lib/purchasing";

export const dynamic = "force-dynamic";

const TONE: Record<PoStatus, string> = { draft: "badge-gray", ordered: "badge-blue", partial: "badge bg-amber-50 text-amber-800", received: "badge-green", cancelled: "badge bg-red-50 text-red-700" };

/** Purchases: every purchase order, by status, with what is still to arrive. */
export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const me = await requirePermission("purchasing.view");
  const { t, locale } = await getDict();
  const P = t.purchasing;
  const sp = await searchParams;
  const status = (PO_STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as PoStatus) : null;
  const q = String(sp.q ?? "").trim().slice(0, 60);
  const [{ data: orders }, { data: sups }, { data: locs }] = await Promise.all([
    db().from("purchase_orders").select("id, po_no, supplier_id, location_id, currency, rate, status, expected_on, supplier_ref, total, created_at").order("po_no", { ascending: false }).limit(1000),
    db().from("suppliers").select("id, name"),
    db().from("locations").select("id, name_en, name_ar"),
  ]);
  const supName = new Map((sups ?? []).map((s) => [s.id, s.name]));
  const locName = new Map((locs ?? []).map((l) => [l.id, (locale === "ar" && l.name_ar) || l.name_en]));
  const counts = Object.fromEntries(PO_STATUSES.map((s) => [s, (orders ?? []).filter((o) => o.status === s).length]));
  const rows = (orders ?? []).filter((o) => (!status || o.status === status) && (!q || String(o.po_no) === q.replace(/^PO-?/i, "") || (supName.get(o.supplier_id) ?? "").toLowerCase().includes(q.toLowerCase()) || (o.supplier_ref ?? "").toLowerCase().includes(q.toLowerCase())));
  const href = (s: string | null) => `/purchasing?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(q ? { q } : {}) })}`;
  return (
    <>
      <PageHeader title={P.title} subtitle={P.subtitle} t={t} filename="purchases">
        <div className="no-print flex flex-wrap gap-2">
          <Link href="/purchasing/suppliers" className="btn-ghost">{P.suppliers}</Link>
          {me.perms.has("purchasing.edit") && <Link href="/purchasing/new" className="btn-primary" data-testid="new-po">+ {P.newOrder}</Link>}
        </div>
      </PageHeader>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Link href={href(null)} className={!status ? "btn-primary" : "btn-ghost"}>{P.all} ({(orders ?? []).length})</Link>
        {PO_STATUSES.map((s) => <Link key={s} href={href(s)} className={status === s ? "btn-primary" : "btn-ghost"}>{P.statuses[s]} ({counts[s]})</Link>)}
        <form className="flex gap-2" action="/purchasing">
          {status && <input type="hidden" name="status" value={status} />}
          <input name="q" defaultValue={q} className="input w-56" placeholder={P.search} aria-label={P.search} />
          <button className="btn-ghost">{P.find}</button>
        </form>
      </div>
      <section className="card overflow-hidden p-0">
        {rows.length === 0 ? <p className="p-5 text-sm text-gray-500">{P.none}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="po-table">
            <thead><tr><th>{P.order}</th><th>{P.supplier}</th><th>{P.store}</th><th>{P.status}</th><th>{P.expected}</th><th>{P.total}</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} data-po={o.po_no}>
                  <td className="cell-title"><Link href={`/purchasing/${o.id}`} className="font-medium underline" dir="ltr" data-testid="po-link">PO-{o.po_no}</Link><div className="text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" })}</div></td>
                  <td data-label={P.supplier}>{supName.get(o.supplier_id) ?? "—"}{o.supplier_ref && <div className="text-xs text-gray-400" dir="ltr">{o.supplier_ref}</div>}</td>
                  <td data-label={P.store}>{locName.get(o.location_id) ?? "—"}</td>
                  <td data-label={P.status}><span className={TONE[o.status as PoStatus]}>{P.statuses[o.status as PoStatus]}</span></td>
                  <td data-label={P.expected}>{o.expected_on ?? "—"}</td>
                  <td data-label={P.total} dir="ltr" className="font-semibold">{Number(o.total).toFixed(2)} {o.currency}{o.currency !== "SAR" && <div className="text-xs font-normal text-gray-400">{(Number(o.total) * Number(o.rate)).toFixed(2)} SAR</div>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
