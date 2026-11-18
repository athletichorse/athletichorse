import { TILL_ROLES, type PermissionKey, type Role } from "@/lib/permissions";
import type { Dict } from "@/i18n";
import type { IconName } from "./icons";

export type NavItem = { label: string; href: string; icon: IconName; soon?: boolean };
export type SubTab = { label: string; href: string };
/** One of the 6 main sections, with the pages inside it (shown as tabs). `match` = paths that belong to it. */
export type Section = NavItem & { key: string; match: string[]; tabs: SubTab[] };

type Perms = ReadonlySet<PermissionKey>;
const any = (p: Perms, ...k: PermissionKey[]) => k.some((x) => p.has(x));

/**
 * The 6 main sections, in the business's order. Every page of the portal lives in one of
 * them; Home is the logo, company settings the gear. Tabs appear only if the person may open them.
 */
export function buildSections(t: Dict, perms: Perms, role?: Role): Section[] {
  const till = role !== undefined && TILL_ROLES.includes(role);
  const T = t.pay.tabs;
  const all: (Section & { show: boolean })[] = [
    {
      key: "pos", label: t.menu.pos, href: "/pos", icon: "pos", match: ["/pos"],
      show: any(perms, "pos.collect", "pos.desk", "pos.quick_sale"),
      tabs: [
        { label: t.menu.pos, href: "/pos" },
        ...(perms.has("pos.past_shifts") ? [{ label: t.pos.extra.pastShifts, href: "/pos/shifts" }] : []),
        ...(any(perms, "pos.past_shifts", "pos.shift") ? [{ label: t.pos.extra.endOfDay, href: "/pos/day" }] : []),
        ...(perms.has("settings.edit") ? [{ label: t.pos.expenses.manageTypes, href: "/pos/expense-types" }] : []),
      ],
    },
    {
      key: "stock", label: t.menu.stock, href: "/stock", icon: "stock", match: ["/stock", "/stock-log", "/locations"],
      show: perms.has("stock.view"),
      // same order as the owner's old system: movements first
      tabs: [
        { label: t.stock.flow.tabs.docs, href: "/stock/docs" },
        ...(perms.has("stock.requests") ? [{ label: t.stock.flow.tabs.requests, href: "/stock/requests" }] : []),
        { label: t.stock.flow.tabs.stock, href: "/stock" },
        { label: t.stock.flow.tabs.shortages, href: "/stock/shortages" },
        ...(perms.has("stock.log") ? [{ label: t.menu.stockLog, href: "/stock-log" }] : []),
        ...(!till && perms.has("locations.edit") ? [{ label: t.stock.flow.tabs.warehouses, href: "/locations" }] : []),
      ],
    },
    {
      key: "sales", label: t.menu.sales, href: "/sales", icon: "sales", match: ["/sales"],
      show: !till && perms.has("sales.view"),
      tabs: [
        { label: t.menu.sales, href: "/sales" },
        ...(perms.has("reports.view") ? [{ label: t.reports.title, href: "/sales/reports" }] : []),
      ],
    },
    {
      key: "products", label: t.menu.products, href: "/products", icon: "products", match: ["/products", "/upload"],
      show: !till && perms.has("products.view"),
      tabs: [
        { label: t.menu.products, href: "/products" },
        ...(perms.has("products.edit") ? [{ label: t.products.groups, href: "/products/groups" }, { label: t.levels.title, href: "/products/levels" }] : []),
        ...(perms.has("products.labels") ? [{ label: t.products.labels.title, href: "/products/labels" }] : []),
        ...(perms.has("upload.import") ? [{ label: t.menu.upload, href: "/upload" }] : []),
      ],
    },
    {
      key: "customers", label: t.menu.customers, href: "/customers", icon: "customers", match: ["/customers"],
      show: !till && perms.has("customers.view"),
      tabs: [],
    },
    {
      key: "staff", label: t.menu.staff, href: "/staff", icon: "staff", match: ["/staff", "/permissions", "/audit"],
      show: !till && any(perms, "staff.view", "staff.payroll", "staff.salespeople", "permissions.edit", "audit.view"),
      tabs: [
        ...(perms.has("staff.view") ? [{ label: T.staff, href: "/staff" }] : []),
        ...(perms.has("staff.payroll_edit") ? [{ label: T.employees, href: "/staff/employees" }] : []),
        ...(perms.has("staff.salespeople") ? [{ label: T.attendance, href: "/staff/attendance" }] : []),
        ...(perms.has("staff.payroll") ? [{ label: T.payroll, href: "/staff/payroll" }, { label: T.commission, href: "/staff/commission" }, { label: T.advances, href: "/staff/advances" }] : []),
        ...(perms.has("permissions.edit") ? [{ label: t.nav.permissions, href: "/permissions" }] : []),
        ...(perms.has("audit.view") ? [{ label: t.menu.audit, href: "/audit" }] : []),
      ],
    },
  ];
  return all.filter((s) => s.show).map((s) => ({ key: s.key, label: s.label, icon: s.icon, match: s.match, tabs: s.tabs, href: s.tabs[0]?.href ?? s.href }));
}

/** The section a path belongs to (longest match wins), and the tab to highlight. */
export function activeFor(sections: Section[], path: string): { section: Section | null; tab: string | null } {
  const inside = (p: string, m: string) => p === m || p.startsWith(m + "/");
  let best: Section | null = null, len = -1;
  for (const s of sections) for (const m of s.match) if (inside(path, m) && m.length > len) { best = s; len = m.length; }
  let tab: string | null = null, tlen = -1;
  for (const x of best?.tabs ?? []) if (inside(path, x.href) && x.href.length > tlen) { tab = x.href; tlen = x.href.length; }
  return { section: best, tab };
}
