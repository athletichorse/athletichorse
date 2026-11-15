import Link from "next/link";
import { MENU } from "./menu";
import type { Dict } from "@/i18n";
import type { PermissionKey } from "@/lib/permissions";
import { logoutAction, switchLocaleAction } from "@/app/actions/auth";

export function TopMenu({ t, perms, name }: { t: Dict; perms: ReadonlySet<PermissionKey>; name: string }) {
  // The cashier menu item is shown for desk-only roles too.
  const visible = MENU.filter(
    (m) => m.perm === null || perms.has(m.perm) || (m.key === "pos" && (perms.has("pos.desk") || perms.has("pos.quick_sale"))),
  );
  return (
    <header className="no-print sticky top-0 z-20 bg-[var(--brand)] text-white shadow">
      <div className="mx-auto flex max-w-7xl flex-col gap-1 px-3 py-2 lg:flex-row lg:items-center">
        {/* Phones: one row that scrolls sideways instead of a tall stacked list. */}
        <nav className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto whitespace-nowrap pb-1 lg:flex-wrap lg:pb-0">
          {visible.map((m) => (
            <Link key={m.key} href={m.href} className="shrink-0 rounded-md px-3 py-1.5 text-sm hover:bg-white/15">
              {t.menu[m.key]}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-1 border-t border-white/20 pt-1 lg:border-0 lg:pt-0">
          <span className="min-w-0 flex-1 truncate px-2 text-sm opacity-90">{name}</span>
          <form action={switchLocaleAction}>
            <button className="rounded-md px-2 py-1 text-sm hover:bg-white/15">{t.switchLang}</button>
          </form>
          <form action={logoutAction}>
            <button className="rounded-md px-2 py-1 text-sm hover:bg-white/15">{t.logout}</button>
          </form>
        </div>
      </div>
    </header>
  );
}
