import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { createLevelAction, saveLevelAction } from "@/app/actions/levels";

export const dynamic = "force-dynamic";

/** Price levels (e.g. Wholesale, VIP): several prices per item; a customer is put on one level. */
export default async function PriceLevelsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requirePermission("products.edit");
  const { t } = await getDict();
  const L = t.levels;
  const sp = await searchParams;
  const { data: levels } = await db().from("price_levels").select("id, code, name_en, name_ar, sort, active").order("sort").order("name_en");
  const counts = new Map<string, number>();
  for (const l of levels ?? []) {
    const { count } = l.code === "wholesale"
      ? await db().from("product_variants").select("id", { count: "exact", head: true }).not("wholesale_price", "is", null)
      : await db().from("variant_level_prices").select("variant_id", { count: "exact", head: true }).eq("level_id", l.id);
    counts.set(l.id, count ?? 0);
  }
  const { count: onLevel } = await db().from("customer_details").select("customer_id", { count: "exact", head: true }).not("price_level_id", "is", null);
  const err = sp.err === "duplicate" ? L.duplicate : sp.err === "name" ? L.nameEn : sp.err;
  return (
    <>
      <PageHeader title={L.title} subtitle={L.subtitle} t={t} filename="price-levels" />
      {err && <p className="alert-err">{err}</p>}
      {sp.ok && <p className="alert-ok">{t.saved}</p>}
      <div className="card mb-6 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="table" data-export>
            <thead><tr><th>{L.level}</th><th>{L.items}</th></tr></thead>
            <tbody>
              {(levels ?? []).length === 0 && <tr><td colSpan={2} className="py-8 text-center text-gray-500">{L.none}</td></tr>}
              {(levels ?? []).map((l) => (
                <tr key={l.id}>
                  <td className="cell-title">
                    <form action={saveLevelAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_5rem_auto_auto] sm:items-center">
                      <input type="hidden" name="id" value={l.id} />
                      <input name="name_en" defaultValue={l.name_en} aria-label={L.nameEn} placeholder={L.nameEn} className="input" />
                      <input name="name_ar" defaultValue={l.name_ar} aria-label={L.nameAr} placeholder={L.nameAr} className="input" />
                      <input name="sort" defaultValue={l.sort} aria-label={L.sort} className="input" dir="ltr" inputMode="numeric" />
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={l.active} className="h-4 w-4 accent-[var(--brand)]" />{t.active}</label>
                      <button className="btn-ghost">{t.save}</button>
                      {l.code === "wholesale" && <span className="hint sm:col-span-5">{L.wholesaleNote}</span>}
                    </form>
                  </td>
                  <td data-label={L.items} dir="ltr">{counts.get(l.id) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-sm text-gray-600">{t.customers.title}: {onLevel ?? 0}</p>
      </div>
      <form action={createLevelAction} className="card no-print grid max-w-3xl gap-4 sm:grid-cols-3">
        <h2 className="card-title sm:col-span-3">{L.add}</h2>
        <div><label className="label">{L.nameEn}</label><input name="name_en" className="input" required /></div>
        <div><label className="label">{L.nameAr}</label><input name="name_ar" className="input" /></div>
        <div><label className="label">{L.sort}</label><input name="sort" defaultValue="10" className="input" dir="ltr" inputMode="numeric" /></div>
        <div className="flex justify-end sm:col-span-3"><button className="btn-primary">{t.add}</button></div>
      </form>
    </>
  );
}
