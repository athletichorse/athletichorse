import type { PermissionKey } from "@/lib/permissions";
import type { Dict } from "@/i18n";

/** Top menu — order is fixed by the business (right-to-left in Arabic). */
export const MENU: { key: keyof Dict["menu"]; href: string; perm: PermissionKey | null }[] = [
  { key: "pos", href: "/pos", perm: "pos.collect" },
  { key: "stock", href: "/stock", perm: "stock.view" },
  { key: "sales", href: "/sales", perm: "sales.view" },
  { key: "products", href: "/products", perm: "products.view" },
  { key: "customers", href: "/customers", perm: "customers.view" },
  { key: "staff", href: "/staff", perm: "staff.view" },
  { key: "stockLog", href: "/stock-log", perm: "stock.log" },
  { key: "upload", href: "/upload", perm: "upload.import" },
  { key: "audit", href: "/audit", perm: "audit.view" },
  { key: "home", href: "/", perm: null },
];
