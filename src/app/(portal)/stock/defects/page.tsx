import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { PendingButton } from "@/components/PendingButton";
import { settleDefectAction } from "@/app/actions/condition";
import { badStock } from "@/lib/condition-data";
import { DEFECT_ACTIONS } from "@/lib/condition";

export const dynamic = "force-dynamic";

/** The owner decides for faulty pieces: return to supplier, repair or scrap — the store is settled. */
export default async function DefectsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requirePermission("stock.defects");
  const { t, locale } = await getDict();
  const C = t.cond, D = C.defects;
  const sp = await searchParams;
  const [bad, { data: locs }, { data: sups }, { data: hist }] = await Promise.all([
    badStock("all"),
    db().from("locations").select("id, name_en, name_ar"),
    db().from("suppliers").select("id, name").order("name").limit(500),
    db().from("defect_actions").select("id, location_id, variant_id, cond, action, qty, supplier_id, note, created_at").order("created_at", { ascending: false }).limit(30),
  ]);
  const hv = [...new Set((hist ?? []).map((h) => h.variant_id))];
  const { data: hvs } = hv.length ? await db().from("variant_search").select("variant_id, name_en, name_ar, sku").in("variant_id", hv) : { data: [] };
  const locName = (id: string) => { const l = locs?.find((x) => x.id === id); return l ? (locale === "ar" ? l.name_ar : l.name_en || l.name_ar) : "—"; };
  const err = sp.err ? (C.errors as Record<string, string>)[sp.err] ?? sp.err : null;
  // one form per faulty kind (damaged / partial) of each item in each store
  const cases = bad.flatMap((b) => (["damaged", "partial"] as const).filter((c) => b[c] > 0).map((c) => ({ ...b, cond: c, have: b[c] })));
  return (
    <>
      <PageHeader title={D.title} subtitle={D.subtitle} t={t} filename="faulty-items">
        <Link href="/stock/condition" className="btn-ghost no-print">← {C.title}</Link>
      </PageHeader>
      {err && <p className="alert-err">{err}</p>}
      {sp.ok && <p className="alert-ok">{D.done}</p>}
      {cases.length === 0 ? <p className="card mb-4 text-sm text-gray-500">{C.none}</p> : (
        <div className="mb-4 grid gap-3" data-testid="defect-cases">
          {cases.map((c) => (
            <form key={`${c.location_id}-${c.variant_id}-${c.cond}`} action={settleDefectAction} className="card grid gap-3 md:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] md:items-end" data-testid="defect-case">
              <input type="hidden" name="location_id" value={c.location_id} />
              <input type="hidden" name="variant_id" value={c.variant_id} />
              <input type="hidden" name="cond" value={c.cond} />
              <input type="hidden" name="client_id" value={crypto.randomUUID()} />
              <div className="flex min-w-0 items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.image_url ? <img src={c.image_url} alt="" className="h-12 w-12 shrink-0 rounded border border-[var(--line)] object-contain" /> : null}
                <div className="min-w-0">
                  <div className="truncate font-semibold text-gray-900">{locale === "ar" && c.name_ar ? c.name_ar : c.name_en}</div>
                  <div className="text-xs text-gray-500">{c.options} <span dir="ltr" className="font-mono">{c.sku}</span></div>
                  <div className="text-sm">{locName(c.location_id)} · <span className={c.cond === "damaged" ? "badge bg-red-50 text-red-700" : "badge bg-amber-50 text-amber-800"}>{c.cond === "damaged" ? C.damaged : C.partial}: <span dir="ltr">{c.have}</span></span></div>
                </div>
              </div>
              <div><label className="label" htmlFor={`a-${c.variant_id}-${c.cond}`}>{D.action}</label>
                <select id={`a-${c.variant_id}-${c.cond}`} name="action" className="input" data-testid="defect-action">{DEFECT_ACTIONS.map((a) => <option key={a} value={a}>{D.actions[a]}</option>)}</select></div>
              <div><label className="label" htmlFor={`q-${c.variant_id}-${c.cond}`}>{C.qty}</label>
                <input id={`q-${c.variant_id}-${c.cond}`} name="qty" className="input" dir="ltr" inputMode="decimal" defaultValue={String(c.have)} data-testid="defect-qty" /></div>
              <div><label className="label" htmlFor={`s-${c.variant_id}-${c.cond}`}>{D.supplier}</label>
                <select id={`s-${c.variant_id}-${c.cond}`} name="supplier_id" className="input"><option value="">—</option>{(sups ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className="label" htmlFor={`n-${c.variant_id}-${c.cond}`}>{C.note}</label>
                <input id={`n-${c.variant_id}-${c.cond}`} name="note" className="input" maxLength={300} /></div>
              <PendingButton label={D.apply} pendingLabel={C.saving} />
            </form>
          ))}
        </div>
      )}
      <section className="card overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{D.history}</h2>
        {(hist ?? []).length === 0 ? <p className="px-5 pb-4 text-sm text-gray-500">{C.noChanges}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="defect-history">
            <thead><tr><th>{C.item}</th><th>{C.store}</th><th>{D.action}</th><th>{C.qty}</th><th>{D.supplier}</th><th>{C.note}</th></tr></thead>
            <tbody>
              {(hist ?? []).map((h) => {
                const v = hvs?.find((x) => x.variant_id === h.variant_id);
                return (
                  <tr key={h.id}>
                    <td className="cell-title">{locale === "ar" && v?.name_ar ? v.name_ar : v?.name_en}<div className="text-xs font-normal text-gray-500">{formatDateTime(new Date(h.created_at), locale)} · {h.cond === "damaged" ? C.damaged : C.partial}</div></td>
                    <td data-label={C.store}>{locName(h.location_id)}</td>
                    <td data-label={D.action}>{D.actions[h.action as keyof typeof D.actions] ?? h.action}</td>
                    <td data-label={C.qty} dir="ltr">{Number(h.qty)}</td>
                    <td data-label={D.supplier}>{sups?.find((s) => s.id === h.supplier_id)?.name ?? "—"}</td>
                    <td data-label={C.note}>{h.note || "—"}</td>
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
