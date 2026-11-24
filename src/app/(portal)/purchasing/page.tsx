import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { PO_STATUSES, type PoStatus } from "@/lib/purchasing";
import { FX_CURRENCIES, readRates } from "@/lib/fx";
import { saveRatesAction } from "@/app/actions/purchasing";
import { PendingButton } from "@/components/PendingButton";

export const dynamic = "force-dynamic";

const TONE: Record<PoStatus, string> = { draft: "badge-gray", ordered: "badge-blue", shipped: "badge bg-indigo-50 text-indigo-800", partial: "badge bg-amber-50 text-amber-800", received: "badge-green", cancelled: "badge bg-red-50 text-red-700" };

/** Purchases: every purchase order, by status, with what is still to arrive. */
export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; ok?: string; err?: string }> }) {
  const me = await requirePermission("purchasing.view");
  const { t, locale } = await getDict();
  const P = t.purchasing;
  const sp = await searchParams;
  const status = (PO_STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as PoStatus) : null;
  const q = String(sp.q ?? "").trim().slice(0, 60);
  const [{ data: orders }, { data: sups }, { data: locs }] = await Promise.all([
    db().from("purchase_orders").select("id, po_no, kind, title, supplier_id, location_id, currency, rate, status, expected_on, supplier_ref, total, created_at").order("po_no", { ascending: false }).limit(1000),
    db().from("suppliers").select("id, name"),
    db().from("locations").select("id, name_en, name_ar"),
  ]);
  const { data: fx } = await db().from("settings").select("value").eq("key", "fx_rates").maybeSingle();
  const rates = readRates(fx?.value);
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
      {sp.ok === "fx" && <p className="alert-ok mb-4">{t.saved}</p>}
      {sp.err === "bad_rate" && <p className="alert-err mb-4">{P.errors.bad_rate}</p>}
      <details className="card no-print mb-4" data-testid="fx-rates">
        <summary className="cursor-pointer font-semibold">{P.fxTitle}</summary>
        <p className="mt-1 text-xs text-gray-500">{P.fxHint}</p>
        <form action={saveRatesAction} className="mt-3 flex flex-wrap items-end gap-3">
          {FX_CURRENCIES.map((c) => (
            <div key={c}><label className="label" htmlFor={`fx-${c}`} dir="ltr">1 {c} =</label>
              <input id={`fx-${c}`} name={`fx:${c}`} className="input w-24" dir="ltr" inputMode="decimal" defaultValue={rates[c] !== undefined ? String(rates[c]) : ""} disabled={!me.perms.has("purchasing.edit")} /> <span className="text-xs text-gray-500">SAR</span></div>
          ))}
          {me.perms.has("purchasing.edit") && <PendingButton label={P.save} pendingLabel={P.saving} />}
        </form>
      </details>
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
                  <td className="cell-title"><Link href={`/purchasing/${o.id}`} className="font-medium underline" dir="ltr" data-testid="po-link">PO-{o.po_no}</Link>{o.kind === "china" && <span className="badge bg-red-50 text-red-800 ms-1">{t.cn.title}</span>}{o.title && <div className="text-xs">{o.title}</div>}<div className="text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" })}</div></td>
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
