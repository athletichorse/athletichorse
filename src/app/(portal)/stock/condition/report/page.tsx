import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { viewableLocations } from "@/components/StockTabs";
import { badStock } from "@/lib/condition-data";
import { conditionShares } from "@/lib/condition";

export const dynamic = "force-dynamic";

/** Item condition report: damaged / partial share of each item's stock on hand, per store, with store totals. */
export default async function ConditionReport({ searchParams }: { searchParams: Promise<{ loc?: string }> }) {
  const me = await requirePermission("stock.view");
  const { t, locale } = await getDict();
  const C = t.cond, R = C.report;
  const sp = await searchParams;
  const { data: allLocs } = await db().from("locations").select("id, code, name_en, name_ar").eq("active", true).order("code");
  const view = viewableLocations(allLocs ?? [], me);
  const loc = view.find((l) => l.id === sp.loc)?.id ?? "all";
  const ids = loc === "all" ? view.map((l) => l.id) : [loc];
  const rows = await badStock(ids);
  // total stock on hand in the chosen stores (for the overall share)
  let totalOn = 0;
  for (let from = 0; from < 200_000; from += 1000) {
    const { data } = await db().from("stock_levels").select("qty").in("location_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).gt("qty", 0).range(from, from + 999);
    for (const r of data ?? []) totalOn += Number(r.qty);
    if (!data || data.length < 1000) break;
  }
  const dmg = rows.reduce((a, r) => a + r.damaged, 0), par = rows.reduce((a, r) => a + r.partial, 0);
  const all = conditionShares(totalOn, dmg, par);
  const lname = (id: string) => { const l = allLocs?.find((x) => x.id === id); return l ? (locale === "ar" ? l.name_ar : l.name_en || l.name_ar) : "—"; };
  const chip = (id: string, label: string) => (
    <Link key={id} href={id === "all" ? "/stock/condition/report" : `/stock/condition/report?loc=${id}`} className={`rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap ${loc === id ? "bg-[var(--brand)] text-white" : "border border-[var(--line)] bg-white text-gray-700"}`}>{label}</Link>
  );
  const stat = (label: string, value: string, tone = "") => (
    <div className="card p-4"><div className="text-sm text-gray-500">{label}</div><div className={`text-2xl font-semibold ${tone}`} dir="ltr">{value}</div></div>
  );
  return (
    <>
      <PageHeader title={R.title} subtitle={R.subtitle} t={t} filename="condition-report">
        <Link href="/stock/condition" className="btn-ghost no-print">← {C.title}</Link>
      </PageHeader>
      <div className="no-print mb-3 flex flex-wrap gap-2">{chip("all", t.stock.allLocations)}{view.map((l) => chip(l.id, locale === "ar" ? l.name_ar : l.name_en || l.name_ar))}</div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="cond-totals">
        {stat(C.onHand, totalOn.toLocaleString("en-US"))}
        {stat(R.sound, all.good.toLocaleString("en-US"), "text-emerald-700")}
        {stat(`${C.damaged} · ${R.damagedPct}`, `${dmg} · ${all.damagedPct}%`, dmg ? "text-red-600" : "")}
        {stat(`${C.partial} · ${R.partialPct}`, `${par} · ${all.partialPct}%`, par ? "text-amber-700" : "")}
      </div>
      <section className="card overflow-hidden p-0">
        {rows.length === 0 ? <p className="p-5 text-sm text-gray-500">{C.none}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="cond-report">
            <thead><tr><th>{C.item}</th><th>SKU</th><th>{C.store}</th><th>{C.onHand}</th><th>{R.sound}</th><th>{C.damaged}</th><th>{R.damagedPct}</th><th>{C.partial}</th><th>{R.partialPct}</th><th>{R.badPct}</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const s = conditionShares(r.onHand, r.damaged, r.partial);
                return (
                  <tr key={`${r.location_id}-${r.variant_id}`}>
                    <td className="cell-title">{locale === "ar" && r.name_ar ? r.name_ar : r.name_en}{r.options && <div className="text-xs font-normal text-gray-500">{r.options}</div>}</td>
                    <td data-label="SKU" dir="ltr" className="font-mono text-xs">{r.sku ?? "—"}</td>
                    <td data-label={C.store}>{lname(r.location_id)}</td>
                    <td data-label={C.onHand} dir="ltr">{r.onHand}</td>
                    <td data-label={R.sound} dir="ltr" className="text-emerald-700">{s.good}</td>
                    <td data-label={C.damaged} dir="ltr" className="text-red-600">{r.damaged || "—"}</td>
                    <td data-label={R.damagedPct} dir="ltr" className="text-red-600">{s.damagedPct}%</td>
                    <td data-label={C.partial} dir="ltr" className="text-amber-700">{r.partial || "—"}</td>
                    <td data-label={R.partialPct} dir="ltr" className="text-amber-700">{s.partialPct}%</td>
                    <td data-label={R.badPct} dir="ltr" className="font-semibold">{s.badPct}%</td>
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
