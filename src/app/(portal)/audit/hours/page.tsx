import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { ROLES } from "@/lib/permissions";
import { PageHeader } from "@/components/PageHeader";
import { AuditTabs } from "@/components/AuditTabs";
import { saveHoursAction } from "@/app/actions/security";

export const dynamic = "force-dynamic";

/** Working hours per group or person (Riyadh time). Outside them: no login. The owner is never limited. */
export default async function HoursPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requirePermission("permissions.edit");
  const { t } = await getDict();
  const S = t.security;
  const sp = await searchParams;
  const [{ data: rules }, { data: people }] = await Promise.all([
    db().from("work_hours").select("*"),
    db().from("profiles").select("id, full_name, role").neq("role", "owner").eq("active", true).order("full_name"),
  ]);
  const targets = [
    ...ROLES.filter((r) => r !== "owner").map((r) => ({ key: `role:${r}`, label: `${S.group}: ${t.roles[r]}`, rule: rules?.find((x) => x.role === r) })),
    ...(people ?? []).map((p) => ({ key: `person:${p.id}`, label: `${S.person}: ${p.full_name}`, rule: rules?.find((x) => x.profile_id === p.id) })),
  ];
  return (
    <>
      <PageHeader title={S.hours} subtitle={S.hoursHint} t={t} filename="working-hours" />
      <AuditTabs t={t} active="hours" canEdit />
      {sp.err && <p className="alert-err">{S.bad}</p>}
      {sp.ok && <p className="alert-ok">{t.saved}</p>}
      <div className="space-y-3">
        {targets.map((x) => (
          <form key={x.key} action={saveHoursAction} className="card flex flex-wrap items-end gap-3">
            <input type="hidden" name="who" value={x.key} />
            <div className="min-w-48 flex-1 font-medium">{x.label}{x.rule?.active && <span className="badge-green ms-2">{S.on}</span>}</div>
            <div className="flex flex-wrap gap-2 text-sm">
              {S.days.map((d, i) => <label key={i} className="flex items-center gap-1"><input type="checkbox" name="days" value={i} defaultChecked={x.rule ? (x.rule.days as number[]).includes(i) : i !== 5} className="h-4 w-4 accent-[var(--brand)]" />{d}</label>)}
            </div>
            <div><label className="label">{S.from}</label><input type="time" name="start" defaultValue={String(x.rule?.start_time ?? "08:00").slice(0, 5)} className="input" dir="ltr" /></div>
            <div><label className="label">{S.to}</label><input type="time" name="end" defaultValue={String(x.rule?.end_time ?? "23:00").slice(0, 5)} className="input" dir="ltr" /></div>
            <label className="flex items-center gap-2 pb-2.5 text-sm"><input type="checkbox" name="active" defaultChecked={x.rule?.active ?? false} className="h-4 w-4 accent-[var(--brand)]" /> {S.on}</label>
            <button className="btn-primary">{t.save}</button>
          </form>
        ))}
      </div>
    </>
  );
}
