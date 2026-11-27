import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { ConditionForm } from "@/components/ConditionForm";
import { viewableLocations } from "@/components/StockTabs";
import { badStock } from "@/lib/condition-data";

export const dynamic = "force-dynamic";

/** Item condition: change part or all of an item's stock to sound / damaged / partial defect; list of items not sound; latest changes. */
export default async function ConditionPage({ searchParams }: { searchParams: Promise<{ loc?: string; v?: string }> }) {
  const me = await requireStaff();
  if (!me.perms.has("stock.view") && !me.perms.has("stock.condition")) redirect("/forbidden?k=stock.condition");
  const { t, locale } = await getDict();
  const C = t.cond;
  const sp = await searchParams;
  const { data: allLocs } = await db().from("locations").select("id, code, name_en, name_ar, kind").eq("active", true).order("code");
  const lname = (l: { name_en: string; name_ar: string }) => (locale === "ar" ? l.name_ar : l.name_en || l.name_ar);
  const own = (allLocs ?? []).filter((l) => me.locations === "all" || me.locations.includes(l.id));
  const view = viewableLocations(allLocs ?? [], me);
  const viewIds = view.map((l) => l.id);
  const bad = await badStock(me.locations === "all" || me.perms.has("stock.all_locations") ? "all" : viewIds);
  const { data: recent } = await db().from("condition_changes").select("id, location_id, variant_id, from_cond, to_cond, qty, note, created_by, created_at")
    .in("location_id", viewIds.length ? viewIds : ["00000000-0000-0000-0000-000000000000"]).order("created_at", { ascending: false }).limit(30);
  const rv = [...new Set((recent ?? []).map((r) => r.variant_id))];
  const [{ data: rvs }, { data: people }] = await Promise.all([
    rv.length ? db().from("variant_search").select("variant_id, sku, name_en, name_ar, option1, option2").in("variant_id", rv) : Promise.resolve({ data: [] as { variant_id: string; sku: string | null; name_en: string; name_ar: string; option1: string | null; option2: string | null }[] }),
    db().from("profiles").select("id, full_name").in("id", [...new Set((recent ?? []).map((r) => r.created_by).filter(Boolean))] as string[]),
  ]);
  const condLabel = (c: string) => (c === "good" ? C.good : c === "damaged" ? C.damaged : C.partial);
  const locName = (id: string) => { const l = allLocs?.find((x) => x.id === id); return l ? lname(l) : "—"; };
  const canChange = me.perms.has("stock.condition") && own.length > 0;
  const presetVar = sp.v && /^[0-9a-f-]{36}$/i.test(sp.v) ? bad.find((b) => b.variant_id === sp.v) : undefined;
  const defStore = own.find((l) => l.id === sp.loc)?.id ?? own[0]?.id ?? "";
  return (
    <>
      <PageHeader title={C.title} subtitle={C.subtitle} t={t} filename="item-condition">
        <div className="no-print flex flex-wrap gap-2">
          <Link href="/stock/condition/report" className="btn-ghost">{C.reportTab}</Link>
          {me.perms.has("stock.defects") && <Link href="/stock/defects" className="btn-primary">{C.defectsTab}</Link>}
        </div>
      </PageHeader>
      {canChange && <ConditionForm t={t} locale={locale} stores={own.map((l) => ({ id: l.id, name: lname(l) }))} defaultStore={defStore}
        preset={presetVar ? { variantId: presetVar.variant_id, name: `${locale === "ar" && presetVar.name_ar ? presetVar.name_ar : presetVar.name_en}${presetVar.options ? " · " + presetVar.options : ""}` } : null} />}

      <section className="card mb-4 overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{C.notSound} ({bad.length})</h2>
        {bad.length === 0 ? <p className="px-5 pb-4 text-sm text-gray-500">{C.none}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="cond-bad">
            <thead><tr><th>{C.item}</th><th>{C.store}</th><th>{C.onHand}</th><th>{C.good}</th><th>{C.damaged}</th><th>{C.partial}</th><th></th></tr></thead>
            <tbody>
              {bad.map((b) => (
                <tr key={`${b.location_id}-${b.variant_id}`}>
                  <td className="cell-title">{locale === "ar" && b.name_ar ? b.name_ar : b.name_en}{b.options && <div className="text-xs font-normal text-gray-500">{b.options}</div>}<div dir="ltr" className="font-mono text-xs font-normal text-gray-500">{b.sku}</div></td>
                  <td data-label={C.store}>{locName(b.location_id)}</td>
                  <td data-label={C.onHand} dir="ltr" className="font-semibold text-red-600">{b.onHand}</td>
                  <td data-label={C.good} dir="ltr">{Math.max(0, b.onHand - b.damaged - b.partial)}</td>
                  <td data-label={C.damaged} dir="ltr" className="text-red-600">{b.damaged || "—"}</td>
                  <td data-label={C.partial} dir="ltr" className="text-amber-700">{b.partial || "—"}</td>
                  <td>{canChange && own.some((l) => l.id === b.location_id) && <Link href={`/stock/condition?loc=${b.location_id}&v=${b.variant_id}`} className="text-sm text-[var(--brand)] underline">{C.change}</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      <section className="card overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{C.recent}</h2>
        {(recent ?? []).length === 0 ? <p className="px-5 pb-4 text-sm text-gray-500">{C.noChanges}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-testid="cond-recent">
            <thead><tr><th>{C.item}</th><th>{C.store}</th><th>{C.from}</th><th>{C.to}</th><th>{C.qty}</th><th>{C.note}</th><th>{C.by}</th></tr></thead>
            <tbody>
              {(recent ?? []).map((r) => {
                const v = rvs?.find((x) => x.variant_id === r.variant_id);
                return (
                  <tr key={r.id}>
                    <td className="cell-title">{locale === "ar" && v?.name_ar ? v.name_ar : v?.name_en}<div className="text-xs font-normal text-gray-500">{formatDateTime(new Date(r.created_at), locale)}</div></td>
                    <td data-label={C.store}>{locName(r.location_id)}</td>
                    <td data-label={C.from}>{condLabel(r.from_cond)}</td>
                    <td data-label={C.to} className={r.to_cond === "good" ? "text-emerald-700" : "text-red-600"}>{condLabel(r.to_cond)}</td>
                    <td data-label={C.qty} dir="ltr">{Number(r.qty)}</td>
                    <td data-label={C.note}>{r.note || "—"}</td>
                    <td data-label={C.by}>{people?.find((p) => p.id === r.created_by)?.full_name ?? "—"}</td>
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
