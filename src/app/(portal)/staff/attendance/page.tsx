import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { riyadhDate } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { StaffTabs, monthParam } from "@/components/StaffTabs";
import { AttendanceSheet } from "@/components/AttendanceSheet";

export const dynamic = "force-dynamic";

/** Daily attendance sheet for a month: one row per person, one column per day. */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await requirePermission("staff.salespeople");
  const { t } = await getDict();
  const sp = await searchParams;
  const month = monthParam(sp.month, riyadhDate(new Date()));
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const [{ data: emps }, { data: rows }] = await Promise.all([
    db().from("employees").select("profile_id").eq("active", true),
    db().from("attendance").select("profile_id, day, status, overtime_hours").gte("day", month).lt("day", end),
  ]);
  const ids = (emps ?? []).map((e) => e.profile_id);
  const { data: people } = ids.length ? await db().from("profiles").select("id, full_name").in("id", ids).order("full_name") : { data: [] };
  return (
    <>
      <PageHeader title={`${t.pay.tabs.attendance} · ${month.slice(0, 7)}`} subtitle={t.pay.attendanceHint} t={t} filename={`attendance-${month.slice(0, 7)}`} />
      <StaffTabs t={t} perms={me.perms} active="attendance" />
      <form className="no-print mb-4 flex gap-2" action="/staff/attendance"><input type="month" name="month" defaultValue={month.slice(0, 7)} className="input w-auto" dir="ltr" /><button className="btn-ghost">{t.reports.show}</button></form>
      {(people ?? []).length === 0 ? <p className="card text-sm text-gray-500">{t.pay.none}</p> : (
        <AttendanceSheet t={t} month={month} days={days} people={(people ?? []).map((p) => ({ id: p.id, name: p.full_name }))}
          initial={(rows ?? []).map((r) => ({ profileId: r.profile_id, day: String(r.day).slice(0, 10), status: r.status, overtime: String(Number(r.overtime_hours)) }))} />
      )}
    </>
  );
}
