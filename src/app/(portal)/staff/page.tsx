import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { ROLES } from "@/lib/permissions";
import { PageHeader } from "@/components/PageHeader";
import { createStaffAction, updateStaffAction } from "@/app/actions/staff";

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  const me = await requirePermission("staff.view");
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const canEdit = me.perms.has("staff.edit");
  const [{ data: staff }, { data: locs }] = await Promise.all([
    db().from("profiles").select("id, username, full_name, role, branch_id, locale, phone, active").order("username"),
    db().from("locations").select("id, name_ar, name_en").eq("kind", "branch").order("code"),
  ]);
  const branchName = (id: string | null) => {
    const b = locs?.find((l) => l.id === id);
    return b ? (locale === "ar" ? b.name_ar : b.name_en || b.name_ar) : "—";
  };
  const roles = ROLES.filter((r) => r !== "owner" || me.role === "owner");
  const branchSelect = (value?: string | null) => (
    <select name="branch_id" defaultValue={value ?? ""} className="input">
      <option value="">{t.staff.noBranch}</option>
      {locs?.map((l) => <option key={l.id} value={l.id}>{locale === "ar" ? l.name_ar : l.name_en || l.name_ar}</option>)}
    </select>
  );
  const roleSelect = (value?: string) => (
    <select name="role" defaultValue={value ?? "cashier"} className="input">
      {(value === "owner" ? ROLES : roles).map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
    </select>
  );

  return (
    <>
      <PageHeader title={t.staff.title} t={t} filename="staff">
        {me.perms.has("permissions.edit") && <Link className="btn-ghost no-print" href="/permissions">{t.staff.permissionsLink}</Link>}
      </PageHeader>
      {sp.err && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{sp.err === "phone" ? t.staff.badPhone : sp.err}</p>}
      {sp.ok && <p className="mb-3 rounded bg-green-50 p-2 text-sm text-green-700">{t.saved}</p>}

      <div className="card overflow-x-auto">
        <table className="table" data-export>
          <thead>
            <tr><th>{t.staff.username}</th><th>{t.staff.fullName}</th><th>{t.staff.role}</th><th>{t.staff.branch}</th><th>{t.staff.phone}</th><th>{t.active}</th></tr>
          </thead>
          <tbody>
            {staff?.map((s) => (
              <tr key={s.id}>
                <td dir="ltr" className="text-start">{s.username}</td>
                <td>{s.full_name}</td>
                <td>{t.roles[s.role as keyof typeof t.roles] ?? s.role}</td>
                <td>{branchName(s.branch_id)}</td>
                <td dir="ltr" className="text-start">{s.phone ?? ""}</td>
                <td>{s.active ? t.yes : t.no}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="no-print mt-4 grid gap-4 lg:grid-cols-2">
          <form action={createStaffAction} className="card space-y-2">
            <h2 className="font-semibold">{t.staff.newStaff}</h2>
            <div className="grid grid-cols-2 gap-2">
              <input name="username" placeholder={t.staff.username} className="input" required dir="ltr" />
              <input name="full_name" placeholder={t.staff.fullName} className="input" required />
              {roleSelect()}
              {branchSelect()}
              <input name="phone" placeholder="05XXXXXXXX" className="input" dir="ltr" />
              <select name="locale" className="input" defaultValue="ar"><option value="ar">العربية</option><option value="en">English</option></select>
              <input name="password" type="password" placeholder={t.staff.password} className="input" required minLength={8} dir="ltr" />
              <input name="pin" placeholder={t.staff.pin} className="input" inputMode="numeric" dir="ltr" />
            </div>
            <button className="btn-primary">{t.add}</button>
          </form>

          <div className="card space-y-3">
            <h2 className="font-semibold">{t.edit}</h2>
            {staff?.filter((s) => s.role !== "owner" || me.role === "owner").map((s) => (
              <details key={s.id} className="rounded border p-2">
                <summary className="cursor-pointer text-sm">{s.full_name} <span dir="ltr">({s.username})</span></summary>
                <form action={updateStaffAction} className="mt-2 grid grid-cols-2 gap-2">
                  <input type="hidden" name="id" value={s.id} />
                  <input name="full_name" defaultValue={s.full_name} className="input" required />
                  {roleSelect(s.role)}
                  {branchSelect(s.branch_id)}
                  <input name="phone" defaultValue={s.phone ?? ""} placeholder="05XXXXXXXX" className="input" dir="ltr" />
                  <select name="locale" className="input" defaultValue={s.locale}><option value="ar">العربية</option><option value="en">English</option></select>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={s.active} /> {t.active}</label>
                  <input name="password" type="password" placeholder={t.staff.password} className="input" dir="ltr" />
                  <input name="pin" placeholder={t.staff.pin} className="input" inputMode="numeric" dir="ltr" />
                  <button className="btn-primary col-span-2">{t.save}</button>
                </form>
              </details>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
