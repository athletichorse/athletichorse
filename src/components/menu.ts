import type { PermissionKey } from "@/lib/permissions";
import type { Dict } from "@/i18n";
import type { IconName } from "./icons";

export type NavItem = { label: string; href: string; icon: IconName };

type Entry = { key: keyof Dict["menu"]; href: string; icon: IconName; perms: PermissionKey[] | null };

/** Main menu, in the business's order (Home sits on top as the dashboard). */
const MAIN: Entry[] = [
  { key: "home", href: "/", icon: "home", perms: null },
  { key: "pos", href: "/pos", icon: "pos", perms: ["pos.collect", "pos.desk", "pos.quick_sale"] },
  { key: "stock", href: "/stock", icon: "stock", perms: ["stock.view"] },
  { key: "sales", href: "/sales", icon: "sales", perms: ["sales.view"] },
  { key: "products", href: "/products", icon: "products", perms: ["products.view"] },
  { key: "customers", href: "/customers", icon: "customers", perms: ["customers.view"] },
  { key: "staff", href: "/staff", icon: "staff", perms: ["staff.view"] },
  { key: "stockLog", href: "/stock-log", icon: "stockLog", perms: ["stock.log"] },
  { key: "upload", href: "/upload", icon: "upload", perms: ["upload.import"] },
  { key: "audit", href: "/audit", icon: "audit", perms: ["audit.view"] },
];

const ADMIN: { key: keyof Dict["nav"]; href: string; icon: IconName; perm: PermissionKey }[] = [
  { key: "company", href: "/company", icon: "company", perm: "settings.edit" },
  { key: "locations", href: "/locations", icon: "locations", perm: "locations.edit" },
  { key: "permissions", href: "/permissions", icon: "permissions", perm: "permissions.edit" },
];

export function buildNav(t: Dict, perms: ReadonlySet<PermissionKey>) {
  const main: NavItem[] = MAIN.filter((e) => e.perms === null || e.perms.some((p) => perms.has(p))).map((e) => ({
    label: t.menu[e.key],
    href: e.href,
    icon: e.icon,
  }));
  const admin: NavItem[] = ADMIN.filter((e) => perms.has(e.perm)).map((e) => ({ label: t.nav[e.key], href: e.href, icon: e.icon }));
  return { main, admin };
}
