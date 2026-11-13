/**
 * THE single source of truth for roles and permissions.
 *
 * Effective permission for a person =
 *   user_permissions override  →  role_permissions override  →  ROLE_DEFAULTS below.
 * The owner always has every permission (cannot be locked out).
 *
 * Keys under "approval.*" are RULES, not abilities: when true for a person, that
 * action needs a manager's username + PIN (someone who has "approval.approve").
 */

export const ROLES = [
  "owner",
  "manager",
  "accountant",
  "warehouse",
  "cashier",
  "pos",
  "cashier_pos",
  "marketing",
] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSION_KEYS = [
  // POS / الكاشير
  "pos.desk", // quotation at the desk
  "pos.collect", // collect payment at the cashier
  "pos.quick_sale",
  "pos.shift",
  "pos.return",
  "pos.discount",
  "pos.price_change",
  "pos.cash_out",
  "pos.reprint",
  // Sales / المبيعات
  "sales.view",
  "sales.view_all_branches",
  // Stock / المخازن
  "stock.view",
  "stock.transfer",
  "stock.receive",
  "stock.write_off",
  "stock.count",
  "stock.log",
  // Products / المنتجات
  "products.view",
  "products.edit",
  "products.view_cost",
  // Customers / العملاء
  "customers.view",
  "customers.edit",
  // Staff / الموظفين
  "staff.view",
  "staff.edit",
  // Admin
  "permissions.edit",
  "locations.edit",
  "settings.edit",
  "upload.import",
  "audit.view",
  "reports.view",
  // Manager approval (username + PIN)
  "approval.approve", // may approve others with own PIN
  "approval.discount", // discounts & price changes need approval
  "approval.return",
  "approval.cash_out",
  "approval.stock_receive",
  "approval.write_off",
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const APPROVAL_RULE_KEYS = [
  "approval.discount",
  "approval.return",
  "approval.cash_out",
  "approval.stock_receive",
  "approval.write_off",
] as const satisfies readonly PermissionKey[];

/** Permission groups, for displaying the صلاحيات page. */
export const PERMISSION_GROUPS: Record<string, readonly PermissionKey[]> = {
  pos: PERMISSION_KEYS.filter((k) => k.startsWith("pos.")),
  sales: PERMISSION_KEYS.filter((k) => k.startsWith("sales.") || k === "reports.view"),
  stock: PERMISSION_KEYS.filter((k) => k.startsWith("stock.")),
  products: PERMISSION_KEYS.filter((k) => k.startsWith("products.")),
  customers: PERMISSION_KEYS.filter((k) => k.startsWith("customers.")),
  staff: PERMISSION_KEYS.filter((k) => k.startsWith("staff.")),
  admin: [
    "permissions.edit",
    "locations.edit",
    "settings.edit",
    "upload.import",
    "audit.view",
  ],
  approval: PERMISSION_KEYS.filter((k) => k.startsWith("approval.")),
};

const ALL = PERMISSION_KEYS;
const APPROVAL_ALL = [...APPROVAL_RULE_KEYS];
const cashierBase: PermissionKey[] = ["pos.collect", "pos.quick_sale", "pos.shift", "pos.return", "pos.reprint", "customers.view", "customers.edit", "products.view"];
const deskBase: PermissionKey[] = ["pos.desk", "customers.view", "customers.edit", "products.view"];

export const ROLE_DEFAULTS: Record<Role, readonly PermissionKey[]> = {
  owner: ALL,
  manager: ALL.filter(
    (k) => k !== "permissions.edit" && k !== "settings.edit" && !(APPROVAL_ALL as string[]).includes(k),
  ),
  accountant: ["sales.view", "sales.view_all_branches", "reports.view", "products.view", "products.view_cost", "customers.view", "stock.view", "stock.log", "audit.view"],
  warehouse: ["stock.view", "stock.transfer", "stock.receive", "stock.count", "stock.log", "stock.write_off", "products.view", "approval.stock_receive", "approval.write_off"],
  cashier: [...cashierBase, "sales.view", ...APPROVAL_ALL],
  pos: [...deskBase, ...APPROVAL_ALL],
  cashier_pos: [...new Set<PermissionKey>([...cashierBase, ...deskBase, "sales.view", ...APPROVAL_ALL])],
  marketing: ["customers.view", "products.view", "sales.view", "reports.view"],
};

export type Override = { permission: string; allowed: boolean };

export function isRole(x: unknown): x is Role {
  return typeof x === "string" && (ROLES as readonly string[]).includes(x);
}
export function isPermissionKey(x: unknown): x is PermissionKey {
  return typeof x === "string" && (PERMISSION_KEYS as readonly string[]).includes(x);
}

/** Compute the effective permission set for one person. Pure (tested). */
export function resolvePermissions(
  role: Role,
  roleOverrides: readonly Override[],
  userOverrides: readonly Override[],
): Set<PermissionKey> {
  if (role === "owner") return new Set(PERMISSION_KEYS);
  const result = new Set<PermissionKey>(ROLE_DEFAULTS[role]);
  for (const layer of [roleOverrides, userOverrides]) {
    for (const o of layer) {
      if (!isPermissionKey(o.permission)) continue;
      if (o.allowed) result.add(o.permission);
      else result.delete(o.permission);
    }
  }
  return result;
}

export function can(perms: ReadonlySet<PermissionKey>, key: PermissionKey): boolean {
  return perms.has(key);
}

/** True when this action needs a manager's username + PIN for this person. */
export function needsApproval(
  perms: ReadonlySet<PermissionKey>,
  rule: (typeof APPROVAL_RULE_KEYS)[number],
): boolean {
  return perms.has(rule) && !perms.has("approval.approve");
}
