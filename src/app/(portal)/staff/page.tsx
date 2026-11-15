import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { ROLES } from "@/lib/permissions";
import { PageHeader } from "@/components/PageHeader";
import { createStaffAction, updateStaffAction } from "@/app/actions/staff";

type Row = { id: string; username: string; full_name: string; role: string; branch_id: string | null; locale: string; phone: string | null; active: boolean };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const me = await requirePermission("staff.view");
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const canEdit = me.perms.has("staff.edit");
  const [{ data: staff }, { data: locs }, { data: allFlags }, { data: links }] = await Promise.all([
    db().from("profiles").select("id, username, full_name, role, branch_id, locale, phone, active").order("full_name"),
    db().from("locations").select("id, name_ar, name_en").eq("active", true).order("code"),
    db().from("profiles").select("id, all_locations"),
    db().from("staff_locations").select("user_id, location_id"),
  ]);
  const rows = (staff ?? []) as Row[];
  const isAll = (r: Row) => r.role === "owner" || Boolean(allFlags?.find((f) => f.id === r.id)?.all_locations);
  const extraIds = (r: Row) => (links ?? []).filter((l) => l.user_id === r.id).map((l) => l.location_id);
  const locSummary = (r: Row) => {
    if (isAll(r)) return t.staff.allLocations;
    const ids = [...new Set([r.branch_id, ...extraIds(r)].filter(Boolean))] as string[];
    return ids.length ? ids.map(locName).join(", ") : "—";
  };
  const locName = (id: string | null) => {
    const b = locs?.find((l) => l.id === id);
    return b ? (locale === "ar" ? b.name_ar : b.name_en || b.name_ar) : "—";
  };
  const roleLabel = (r: string) => t.roles[r as keyof typeof t.roles] ?? r;
  const roles = ROLES.filter((r) => r !== "owner" || me.role === "owner");

  const uattrs = { autoCapitalize: "none", autoCorrect: "off", spellCheck: false } as const;
  const fields = (s?: Row) => (
    <div className="grid gap-4 sm:grid-cols-2">
      {!s && (
        <div>
          <label className="label">{t.staff.username}</label>
          <input name="username" className="input" required dir="ltr" {...uattrs} />
        </div>
      )}
      <div>
        <label className="label">{t.staff.fullName}</label>
        <input name="full_name" defaultValue={s?.full_name} className="input" required />
      </div>
      <div>
        <label className="label">{t.staff.role}</label>
        <select name="role" defaultValue={s?.role ?? "cashier"} className="input">
          {(s?.role === "owner" ? ROLES : roles).map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
        </select>
      </div>
      <div>
        <label className="label">{t.staff.branch}</label>
        <select name="branch_id" defaultValue={s?.branch_id ?? ""} className="input">
          <option value="">{t.staff.noBranch}</option>
          {locs?.map((l) => <option key={l.id} value={l.id}>{locale === "ar" ? l.name_ar : l.name_en || l.name_ar}</option>)}
        </select>
      </div>
      <div>
        <label className="label">{t.staff.phone}</label>
        <input name="phone" defaultValue={s?.phone ?? ""} placeholder="05XXXXXXXX" className="input" dir="ltr" inputMode="tel" />
      </div>
      <div>
        <label className="label">{t.staff.locale}</label>
        <select name="locale" className="input" defaultValue={s?.locale ?? "en"}>
          <option value="en">English</option>
          <option value="ar">العربية</option>
        </select>
      </div>
      <div>
        <label className="label">{t.staff.password}</label>
        <input name="password" type="password" className="input" required={!s} minLength={8} dir="ltr" autoComplete="new-password" />
      </div>
      <div>
        <label className="label">{t.staff.pin}</label>
        <input name="pin" className="input" inputMode="numeric" dir="ltr" autoComplete="off" />
      </div>
      {s?.role !== "owner" && (
        <fieldset className="rounded-xl border border-[var(--line)] p-3 sm:col-span-2">
          <legend className="px-1 text-sm font-medium text-gray-700">{t.staff.worksAt}</legend>
          <label className="flex items-center gap-2 py-1 text-sm font-medium text-gray-900">
            <input type="checkbox" name="all_locations" defaultChecked={s ? isAll(s) : false} className="h-4 w-4 accent-[var(--brand)]" /> {t.staff.allLocations}
          </label>
          <div className="mt-1 grid grid-cols-2 gap-x-4">
            {locs?.map((l) => (
              <label key={l.id} className="flex items-center gap-2 py-1 text-sm text-gray-700">
                <input type="checkbox" name="locations" value={l.id} defaultChecked={s ? extraIds(s).includes(l.id) || s.branch_id === l.id : false} className="h-4 w-4 accent-[var(--brand)]" />
                {locale === "ar" ? l.name_ar : l.name_en || l.name_ar}
              </label>
            ))}
          </div>
          <p className="hint">{t.staff.worksAtHint}</p>
        </fieldset>
      )}
      {s && (
        <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2">
          <input type="checkbox" name="active" defaultChecked={s.active} className="h-4 w-4 accent-[var(--brand)]" /> {t.active}
        </label>
      )}
    </div>
  );

  return (
    <>
      <PageHeader title={t.staff.title} t={t} filename="staff">
        {me.perms.has("permissions.edit") && <Link className="btn-ghost no-print" href="/permissions">{t.staff.permissionsLink}</Link>}
      </PageHeader>
      {sp.err && <p className="alert-err">{sp.err === "phone" ? t.staff.badPhone : sp.err}</p>}
      {sp.ok && <p className="alert-ok">{t.saved}</p>}

      <div className="card mb-6 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="table" data-export>
            <thead>
              <tr><th>{t.staff.fullName}</th><th>{t.staff.username}</th><th>{t.staff.role}</th><th>{t.staff.branch}</th><th>{t.staff.locations}</th><th>{t.staff.phone}</th><th>{t.home.status}</th></tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="cell-title font-medium">{s.full_name}</td>
                  <td data-label={t.staff.username} dir="ltr" className="text-start font-mono text-xs text-gray-500">{s.username}</td>
                  <td data-label={t.staff.role}><span className={s.role === "owner" ? "badge-blue" : "badge-gray"}>{roleLabel(s.role)}</span></td>
                  <td data-label={t.staff.branch}>{locName(s.branch_id)}</td>
                  <td data-label={t.staff.locations}>{locSummary(s)}</td>
                  <td data-label={t.staff.phone} dir="ltr" className="text-start">{s.phone ?? "—"}</td>
                  <td data-label={t.home.status}>{s.active ? <span className="badge-green">{t.active}</span> : <span className="badge-gray">{t.inactive}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {canEdit && (
        <div className="no-print grid gap-6 lg:grid-cols-2">
          <form action={createStaffAction} className="card">
            <h2 className="card-title">{t.staff.newStaff}</h2>
            {fields()}
            <div className="mt-5 flex justify-end"><button className="btn-primary">{t.add}</button></div>
          </form>

          <div className="card">
            <h2 className="card-title">{t.edit}</h2>
            <div className="space-y-2">
              {rows.filter((s) => s.role !== "owner" || me.role === "owner").map((s) => (
                <details key={s.id} className="group rounded-xl border border-[var(--line)]">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm">
                    <span className="font-medium text-gray-900">{s.full_name}</span>
                    <span className="text-xs text-gray-500">{roleLabel(s.role)} ▾</span>
                  </summary>
                  <form action={updateStaffAction} className="border-t border-[var(--line)] p-4">
                    <input type="hidden" name="id" value={s.id} />
                    {fields(s)}
                    <div className="mt-5 flex justify-end"><button className="btn-primary">{t.save}</button></div>
                  </form>
                </details>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
