import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { riyadhDate } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { StaffTabs, monthParam } from "@/components/StaffTabs";
import { PaySheet } from "@/components/PaySheet";
import { PAYROLL_COLS, loadSheet } from "@/lib/pay-sheets";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await requirePermission("staff.payroll");
  const { t } = await getDict();
  const sp = await searchParams;
  const month = monthParam(sp.month, riyadhDate(new Date()), false);
  const { status, rows } = await loadSheet("payroll", month);
  return (
    <>
      <PageHeader title={`${t.pay.tabs.payroll} · ${month.slice(0, 7)}`} subtitle={undefined} t={t} filename={`payroll-${month.slice(0, 7)}`} />
      <StaffTabs t={t} perms={me.perms} active="payroll" />
      <form className="no-print mb-4 flex gap-2" action="/staff/payroll"><input type="month" name="month" defaultValue={month.slice(0, 7)} className="input w-auto" dir="ltr" /><button className="btn-ghost">{t.reports.show}</button></form>
      <PaySheet t={t} sheet="payroll" month={month} status={status} rows={rows} cols={PAYROLL_COLS(t.pay)} canEdit={me.perms.has("staff.payroll_edit")} />
    </>
  );
}
