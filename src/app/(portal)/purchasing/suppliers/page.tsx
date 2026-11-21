import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { PendingButton } from "@/components/PendingButton";
import { saveSupplierAction } from "@/app/actions/purchasing";
import { SupplierFields } from "./SupplierFields";

export const dynamic = "force-dynamic";

/** Suppliers: who we buy from, and what we owe each one. */
export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ err?: string; q?: string }> }) {
  const me = await requirePermission("purchasing.view");
  const { t } = await getDict();
  const P = t.purchasing;
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim().toLowerCase().slice(0, 60);
  const { data } = await db().from("supplier_list").select("id, supplier_no, name, factory, country, currency, phone, active, balance, balance_sar, open_orders").order("name").limit(2000);
  const rows = (data ?? []).filter((s) => !q || `${s.name} ${s.factory ?? ""} ${s.country ?? ""}`.toLowerCase().includes(q));
  const owedSar = (data ?? []).reduce((a, s) => a + Number(s.balance_sar), 0);
  const err = sp.err ? (P.errors as Record<string, string>)[sp.err] ?? sp.err : null;
  return (
    <>
      <PageHeader title={P.suppliers} subtitle={`${P.balanceSar}: ${owedSar.toFixed(2)}`} t={t} filename="suppliers">
        <div className="no-print flex gap-2"><Link href="/purchasing" className="btn-ghost">← {P.back}</Link></div>
      </PageHeader>
      {err && <p className="alert-err mb-4">{err}</p>}
      {me.perms.has("purchasing.edit") && (
        <details className="card no-print mb-4" open={(data ?? []).length === 0}>
          <summary className="cursor-pointer font-semibold" data-testid="new-supplier">+ {P.newSupplier}</summary>
          <form action={saveSupplierAction} className="mt-4 space-y-4">
            <SupplierFields t={t} />
            <div className="flex justify-end"><PendingButton label={P.save} pendingLabel={P.saving} /></div>
          </form>
        </details>
      )}
      <form className="no-print mb-3 flex gap-2" action="/purchasing/suppliers">
        <input name="q" defaultValue={sp.q ?? ""} className="input w-64" placeholder={P.supplierName} aria-label={P.supplierName} />
        <button className="btn-ghost">{P.find}</button>
      </form>
      <section className="card overflow-hidden p-0">
        {rows.length === 0 ? <p className="p-5 text-sm text-gray-500">{P.noSuppliers}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="suppliers-table">
            <thead><tr><th>{P.supplierName}</th><th>{P.factory}</th><th>{P.country}</th><th>{P.openOrders}</th><th>{P.balance}</th><th>{P.balanceSar}</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className={s.active ? "" : "opacity-60"}>
                  <td className="cell-title"><Link href={`/purchasing/suppliers/${s.id}`} className="font-medium underline" data-testid="supplier-link">{s.name}</Link>{!s.active && <span className="badge-gray ms-2">{t.inactive}</span>}</td>
                  <td data-label={P.factory}>{s.factory || "—"}</td>
                  <td data-label={P.country}>{s.country || "—"}</td>
                  <td data-label={P.openOrders}>{Number(s.open_orders)}</td>
                  <td data-label={P.balance} dir="ltr">{Number(s.balance).toFixed(2)} {s.currency}</td>
                  <td data-label={P.balanceSar} dir="ltr" className="font-semibold">{Number(s.balance_sar).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
