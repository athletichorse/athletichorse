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
  const kindBadge = (k: Loc["kind"]) => (k === "branch" ? "badge-green" : k === "warehouse" ? "badge-blue" : "badge-gray");

  const fields = (l?: Loc) => (
    <div className="grid gap-4 sm:grid-cols-2">
      {l && <input type="hidden" name="id" value={l.id} />}
      <div>
        <label className="label">{t.locations.code}</label>
        <input name="code" defaultValue={l?.code} placeholder="BR03" className="input" required dir="ltr" autoCapitalize="characters" />
      </div>
      <div>
        <label className="label">{t.locations.kind}</label>
        <select name="kind" defaultValue={l?.kind ?? "branch"} className="input">
          {(["branch", "warehouse", "sub_store"] as const).map((k) => <option key={k} value={k}>{t.locations.kinds[k]}</option>)}
        </select>
      </div>
      <div>
        <label className="label">{t.locations.nameEn}</label>
        <input name="name_en" defaultValue={l?.name_en} className="input" dir="ltr" />
      </div>
      <div>
        <label className="label">{t.locations.nameAr}</label>
        <input name="name_ar" defaultValue={l?.name_ar} className="input" dir="rtl" required />
      </div>
      <div>
        <label className="label">{t.locations.addressEn}</label>
        <input name="address_en" defaultValue={l?.address_en} className="input" dir="ltr" />
      </div>
      <div>
        <label className="label">{t.locations.addressAr}</label>
        <input name="address_ar" defaultValue={l?.address_ar} className="input" dir="rtl" />
      </div>
      <div>
        <label className="label">{t.locations.parent}</label>
        <select name="parent_id" defaultValue={l?.parent_id ?? ""} className="input">
          <option value="">—</option>
          {parents.filter((p) => p.id !== l?.id).map((p) => <option key={p.id} value={p.id}>{name(p)}</option>)}
        </select>
      </div>
      <div className="flex flex-col justify-end gap-2 text-sm text-gray-700">
        <label className="flex items-center gap-2"><input type="checkbox" name="uses_pos" defaultChecked={l?.uses_pos} className="h-4 w-4 accent-[var(--brand)]" /> {t.locations.usesPos}</label>
        {l && <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={l.active} className="h-4 w-4 accent-[var(--brand)]" /> {t.active}</label>}
      </div>
    </div>
  );

  return (
    <>
      <PageHeader title={t.locations.title} t={t} filename="locations" />
      {sp.err && <p className="alert-err">{sp.err}</p>}
      {sp.ok && <p className="alert-ok">{t.saved}</p>}

      <div className="card mb-6 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="table" data-export>
            <thead><tr><th>{t.locations.code}</th><th>{t.locations.nameEn}</th><th>{t.locations.nameAr}</th><th>{t.locations.kind}</th><th>{t.locations.parent}</th><th>{t.locations.usesPos}</th><th>{t.home.status}</th></tr></thead>
            <tbody>
              {locs.map((l) => (
                <tr key={l.id}>
                  <td className="font-mono text-xs text-gray-500">{l.code}</td>
                  <td className="font-medium">{l.name_en}</td>
                  <td dir="rtl" className="text-start">{l.name_ar}</td>
                  <td><span className={kindBadge(l.kind)}>{t.locations.kinds[l.kind]}</span></td>
                  <td>{name(locs.find((p) => p.id === l.parent_id))}</td>
                  <td>{l.uses_pos ? t.yes : t.no}</td>
                  <td>{l.active ? <span className="badge-green">{t.active}</span> : <span className="badge-gray">{t.inactive}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="no-print grid gap-6 lg:grid-cols-2">
        <form action={saveLocationAction} className="card">
          <h2 className="card-title">{t.add}</h2>
          {fields()}
          <div className="mt-5 flex justify-end"><button className="btn-primary">{t.add}</button></div>
        </form>
        <div className="card">
          <h2 className="card-title">{t.edit}</h2>
          <div className="space-y-2">
            {locs.map((l) => (
              <details key={l.id} className="rounded-xl border border-[var(--line)]">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm">
                  <span className="font-medium text-gray-900">{name(l)}</span>
                  <span className="font-mono text-xs text-gray-500">{l.code} ▾</span>
                </summary>
                <form action={saveLocationAction} className="border-t border-[var(--line)] p-4">
                  {fields(l)}
                  <div className="mt-5 flex justify-end"><button className="btn-primary">{t.save}</button></div>
                </form>
              </details>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
