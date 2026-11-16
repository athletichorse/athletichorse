import { TabNav } from "./TabNav";
import type { Dict } from "@/i18n";
import type { PermissionKey } from "@/lib/permissions";

/** Tabs across the Staff area (shown by permission). */
export function StaffTabs({ t, perms, active }: { t: Dict; perms: ReadonlySet<PermissionKey>; active: string }) {
  const T = t.pay.tabs;
  const tabs = ([
    ["staff", "/staff", T.staff, "staff.view"],
    ["employees", "/staff/employees", T.employees, "staff.payroll_edit"],
    ["attendance", "/staff/attendance", T.attendance, "staff.salespeople"],
    ["payroll", "/staff/payroll", T.payroll, "staff.payroll"],
    ["commission", "/staff/commission", T.commission, "staff.payroll"],
    ["advances", "/staff/advances", T.advances, "staff.payroll"],
  ] as const).filter(([, , , p]) => perms.has(p));
  return (
    <TabNav tabs={tabs.map(([k, h, l]) => [k, h, l] as const)} active={active} />
  );
}

/** "YYYY-MM-01" for a month param, else this month (Riyadh) or the one before. */
export function monthParam(v: string | undefined, today: string, previous = false): string {
  if (v && /^\d{4}-\d{2}$/.test(v)) return `${v}-01`;
  const [y, m] = today.split("-").map(Number);
  const d = previous ? new Date(Date.UTC(y, m - 2, 1)) : new Date(Date.UTC(y, m - 1, 1));
  return d.toISOString().slice(0, 10);
}
