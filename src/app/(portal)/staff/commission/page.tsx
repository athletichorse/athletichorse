import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { riyadhDate } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { StaffTabs, monthParam } from "@/components/StaffTabs";
import { PaySheet } from "@/components/PaySheet";
import { COMMISSION_COLS, loadSheet } from "@/lib/pay-sheets";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await requirePermission("staff.payroll");
  const { t } = await getDict();
  const sp = await searchParams;
  const month = monthParam(sp.month, riyadhDate(new Date()), true);
  const { status, rows } = await loadSheet("commission", month);
  const [y, m] = month.split("-").map(Number);
  const due = new Date(Date.UTC(y, m, 15)).toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title={`${t.pay.tabs.commission} · ${month.slice(0, 7)}`} subtitle={`${t.pay.salesMonth} ${month.slice(0, 7)} · ${t.pay.dueOn} → ${due}`} t={t} filename={`commission-${month.slice(0, 7)}`} />
      <StaffTabs t={t} perms={me.perms} active="commission" />
      <form className="no-print mb-4 flex gap-2" action="/staff/commission"><input type="month" name="month" defaultValue={month.slice(0, 7)} className="input w-auto" dir="ltr" /><button className="btn-ghost">{t.reports.show}</button></form>
      <PaySheet t={t} sheet="commission" month={month} status={status} rows={rows} cols={COMMISSION_COLS(t.pay)} canEdit={me.perms.has("staff.payroll_edit")} />
    </>
  );
}
