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
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-1 px-3 py-2">
        <nav className="flex flex-1 flex-wrap gap-1">
          {visible.map((m) => (
            <Link key={m.key} href={m.href} className="rounded-md px-3 py-1.5 text-sm hover:bg-white/15">
              {t.menu[m.key]}
            </Link>
          ))}
        </nav>
        <span className="px-2 text-sm opacity-90">{name}</span>
        <form action={switchLocaleAction}>
          <button className="rounded-md px-2 py-1 text-sm hover:bg-white/15">{t.switchLang}</button>
        </form>
        <form action={logoutAction}>
          <button className="rounded-md px-2 py-1 text-sm hover:bg-white/15">{t.logout}</button>
        </form>
      </div>
    </header>
  );
}
