import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { saveLocationAction } from "@/app/actions/locations";

type Loc = { id: string; code: string; name_ar: string; name_en: string; kind: "branch" | "warehouse" | "sub_store"; parent_id: string | null; uses_pos: boolean; address_ar: string; address_en: string; active: boolean };

export default async function LocationsPage({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  await requirePermission("locations.edit");
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const { data } = await db().from("locations").select("*").order("kind").order("code");
  const locs = (data ?? []) as Loc[];
  const name = (l?: Loc) => (l ? (locale === "ar" ? l.name_ar : l.name_en || l.name_ar) : "—");
  const parents = locs.filter((l) => l.kind !== "sub_store");

  const fields = (l?: Loc) => (
    <>
      {l && <input type="hidden" name="id" value={l.id} />}
      <input name="code" defaultValue={l?.code} placeholder={t.locations.code} className="input" required dir="ltr" />
      <select name="kind" defaultValue={l?.kind ?? "branch"} className="input">
        {(["branch", "warehouse", "sub_store"] as const).map((k) => <option key={k} value={k}>{t.locations.kinds[k]}</option>)}
      </select>
      <input name="name_ar" defaultValue={l?.name_ar} placeholder={t.locations.nameAr} className="input" required />
      <input name="name_en" defaultValue={l?.name_en} placeholder={t.locations.nameEn} className="input" dir="ltr" />
      <input name="address_ar" defaultValue={l?.address_ar} placeholder={t.locations.addressAr} className="input" />
      <input name="address_en" defaultValue={l?.address_en} placeholder={t.locations.addressEn} className="input" dir="ltr" />
      <select name="parent_id" defaultValue={l?.parent_id ?? ""} className="input" aria-label={t.locations.parent}>
        <option value="">{t.locations.parent}: —</option>
        {parents.filter((p) => p.id !== l?.id).map((p) => <option key={p.id} value={p.id}>{name(p)}</option>)}
      </select>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="uses_pos" defaultChecked={l?.uses_pos} /> {t.locations.usesPos}</label>
      {l && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={l.active} /> {t.active}</label>}
    </>
  );

  return (
    <>
      <PageHeader title={t.locations.title} t={t} filename="locations" />
      {sp.err && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{sp.err}</p>}
      {sp.ok && <p className="mb-3 rounded bg-green-50 p-2 text-sm text-green-700">{t.saved}</p>}
      <div className="card overflow-x-auto">
        <table className="table" data-export>
          <thead><tr><th>{t.locations.code}</th><th>{t.locations.nameAr}</th><th>{t.locations.nameEn}</th><th>{t.locations.kind}</th><th>{t.locations.parent}</th><th>{t.locations.usesPos}</th><th>{t.active}</th></tr></thead>
          <tbody>
            {locs.map((l) => (
              <tr key={l.id}>
                <td dir="ltr" className="text-start">{l.code}</td><td>{l.name_ar}</td><td>{l.name_en}</td>
                <td>{t.locations.kinds[l.kind]}</td><td>{name(locs.find((p) => p.id === l.parent_id))}</td>
                <td>{l.uses_pos ? t.yes : t.no}</td><td>{l.active ? t.yes : t.no}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="no-print mt-4 grid gap-4 lg:grid-cols-2">
        <form action={saveLocationAction} className="card grid grid-cols-2 gap-2">
          <h2 className="col-span-2 font-semibold">{t.add}</h2>
          {fields()}
          <button className="btn-primary col-span-2">{t.add}</button>
        </form>
        <div className="card space-y-2">
          <h2 className="font-semibold">{t.edit}</h2>
          {locs.map((l) => (
            <details key={l.id} className="rounded border p-2">
              <summary className="cursor-pointer text-sm">{l.code} — {name(l)}</summary>
              <form action={saveLocationAction} className="mt-2 grid grid-cols-2 gap-2">
                {fields(l)}
                <button className="btn-primary col-span-2">{t.save}</button>
              </form>
            </details>
          ))}
        </div>
      </div>
    </>
  );
}
