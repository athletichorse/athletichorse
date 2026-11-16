import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { AuditTabs } from "@/components/AuditTabs";
import { setDeviceApprovedAction, setDeviceLockAction } from "@/app/actions/security";

export const dynamic = "force-dynamic";

/** Approved devices per person (device lock). New devices appear here after a login attempt. */
export default async function DevicesPage() {
  await requirePermission("permissions.edit");
  const { t, locale } = await getDict();
  const S = t.security;
  const [{ data: people }, { data: devices }] = await Promise.all([
    db().from("profiles").select("id, full_name, role, device_lock").neq("role", "owner").eq("active", true).order("full_name"),
    db().from("devices").select("*").order("last_seen", { ascending: false }),
  ]);
  return (
    <>
      <PageHeader title={S.devices} subtitle={S.devicesHint} t={t} filename="devices" />
      <AuditTabs t={t} active="devices" canEdit />
      <div className="space-y-3">
        {(people ?? []).map((p) => {
          const mine = (devices ?? []).filter((d) => d.profile_id === p.id);
          return (
            <section key={p.id} className="card">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">{p.full_name} <span className="text-xs text-gray-500">{t.roles[p.role as keyof typeof t.roles]}</span></h2>
                <form action={setDeviceLockAction}><input type="hidden" name="profile_id" value={p.id} /><input type="hidden" name="on" value={p.device_lock ? "0" : "1"} />
                  <button className={p.device_lock ? "btn-primary" : "btn-ghost"}>{p.device_lock ? `🔒 ${S.lockOn}` : S.lockOff}</button></form>
              </div>
              {mine.length === 0 ? <p className="text-sm text-gray-500">{S.noDevices}</p> : (
                <ul className="divide-y divide-[var(--line)] text-sm">
                  {mine.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className={d.approved ? "badge-green" : "badge bg-amber-100 text-amber-800"}>{d.approved ? S.approved : S.pending}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-gray-600">{d.label || d.user_agent || d.device_key.slice(0, 8)} · {formatDateTime(new Date(d.last_seen), locale)}</span>
                      <form action={setDeviceApprovedAction} className="flex gap-2"><input type="hidden" name="id" value={d.id} />
                        <input name="label" defaultValue={d.label} placeholder={S.label} className="input w-36 py-1" />
                        <input type="hidden" name="approved" value={d.approved ? "0" : "1"} />
                        <button className={d.approved ? "btn-ghost py-1" : "btn-primary py-1"}>{d.approved ? S.block : S.approve}</button></form>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
