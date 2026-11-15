import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PERMISSION_GROUPS, ROLES, ROLE_DEFAULTS, isRole, resolvePermissions, type Override, type PermissionKey, type Role } from "@/lib/permissions";
import { PageHeader } from "@/components/PageHeader";
import { saveRolePermissionsAction, saveUserPermissionsAction } from "@/app/actions/permissions";

type SP = { tab?: string; role?: string; user?: string; ok?: string; err?: string };

export default async function PermissionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requirePermission("permissions.edit");
  const { t } = await getDict();
  const sp = await searchParams;
  const tab = sp.tab === "user" ? "user" : "role";
  const editableRoles = ROLES.filter((r) => r !== "owner");
  const role: Role = isRole(sp.role) && sp.role !== "owner" ? sp.role : "manager";

  const { data: people } = await db().from("profiles").select("id, username, full_name, role").neq("role", "owner").order("full_name");
  const person = people?.find((p) => p.id === sp.user);

  // Baseline ("default") shown next to each toggle, and the stored override.
  let baseline: Set<PermissionKey>;
  let overrides: Override[];
  if (tab === "role") {
    baseline = new Set(ROLE_DEFAULTS[role]);
    overrides = (await db().from("role_permissions").select("permission, allowed").eq("role", role)).data ?? [];
  } else if (person && isRole(person.role)) {
    const rp = (await db().from("role_permissions").select("permission, allowed").eq("role", person.role)).data ?? [];
    baseline = resolvePermissions(person.role, rp, []);
    overrides = (await db().from("user_permissions").select("permission, allowed").eq("user_id", person.id)).data ?? [];
  } else {
    baseline = new Set();
    overrides = [];
  }
  const ov = new Map(overrides.map((o) => [o.permission, o.allowed]));
  const showForm = tab === "role" || Boolean(person);
  const tabCls = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-medium transition ${on ? "bg-[var(--brand)] text-white" : "border border-[var(--line)] bg-white text-gray-700 hover:bg-gray-50"}`;

  return (
    <>
      <PageHeader title={t.perms.title} t={t} filename="permissions" />
      <div className="mb-4 rounded-lg border border-[var(--line)] bg-white px-4 py-3 text-sm text-gray-600">{t.perms.ownerNote} {t.perms.approvalNote}</div>
      {sp.err && <p className="alert-err">{sp.err}</p>}
      {sp.ok && <p className="alert-ok">{t.saved}</p>}

      <div className="no-print mb-3 flex flex-wrap gap-2">
        <Link href="/permissions" className={tabCls(tab === "role")}>{t.perms.byRole}</Link>
        <Link href="/permissions?tab=user" className={tabCls(tab === "user")}>{t.perms.byPerson}</Link>
      </div>
      <div className="no-print mb-3 flex flex-wrap gap-2">
        {tab === "role"
          ? editableRoles.map((r) => <Link key={r} href={`/permissions?role=${r}`} className={tabCls(r === role)}>{t.roles[r]}</Link>)
          : people?.map((p) => <Link key={p.id} href={`/permissions?tab=user&user=${p.id}`} className={tabCls(p.id === person?.id)}>{p.full_name}</Link>)}
        {tab === "user" && !person && <span className="text-sm text-gray-500">{t.perms.choosePerson}</span>}
      </div>

      {showForm && (
        <form action={tab === "role" ? saveRolePermissionsAction : saveUserPermissionsAction} className="space-y-4">
          {tab === "role" ? <input type="hidden" name="role" value={role} /> : <input type="hidden" name="user_id" value={person!.id} />}
          {Object.entries(PERMISSION_GROUPS).map(([g, keys]) => (
            <div key={g} className="card overflow-x-auto p-0">
              <h2 className="px-5 pt-5 pb-3 font-semibold text-gray-900">{t.perms.groups[g as keyof typeof t.perms.groups]}</h2>
              <table className="table" data-export={g === "pos" ? "" : undefined}>
                <thead><tr><th>{t.perms.permission}</th><th>{t.perms.default}</th><th className="no-print"></th></tr></thead>
                <tbody>
                  {keys.map((k) => {
                    const cur = ov.has(k) ? (ov.get(k) ? "1" : "0") : "";
                    const locked = k === "permissions.edit" && me.role !== "owner";
                    return (
                      <tr key={k}>
                        <td className="cell-title">{t.perms.keys[k]}<div className="text-xs text-gray-400" dir="ltr">{k}</div></td>
                        <td data-label={t.perms.default}>{baseline.has(k) ? `✓ ${t.perms.allow}` : `✗ ${t.perms.deny}`}</td>
                        <td data-label={t.perms.permission} className="no-print">
                          <select name={`p:${k}`} defaultValue={cur} className="input" disabled={locked}>
                            <option value="">{t.perms.default}</option>
                            <option value="1">{t.perms.allow}</option>
                            <option value="0">{t.perms.deny}</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
          <div className="no-print sticky bottom-4 flex justify-end"><button className="btn-primary shadow-lg">{t.save}</button></div>
        </form>
      )}
    </>
  );
}
