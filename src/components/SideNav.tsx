"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "./icons";
import type { NavItem } from "./menu";

type Props = {
  main: NavItem[];
  admin: NavItem[];
  labels: { admin: string; openMenu: string; closeMenu: string; switchLang: string; logout: string };
  company: string;
  user: { name: string; role: string };
  switchLocale: () => Promise<void>;
  logout: () => Promise<void>;
};

function Links({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map((i) => {
        const active = i.href === "/" ? path === "/" : path === i.href || path.startsWith(i.href + "/");
        return (
          <li key={i.href}>
            <Link
              href={i.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <Icon name={i.icon} />
              {i.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Panel({ p, onNavigate }: { p: Props; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--brand)] text-sm font-bold text-white">
          {p.company.trim().charAt(0).toUpperCase() || "S"}
        </div>
        <div className="min-w-0 truncate text-sm font-semibold text-gray-900">{p.company}</div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <Links items={p.main} onNavigate={onNavigate} />
        {p.admin.length > 0 && (
          <>
            <div className="mt-6 mb-2 px-3 text-xs font-semibold tracking-wide text-gray-400 uppercase">{p.labels.admin}</div>
            <Links items={p.admin} onNavigate={onNavigate} />
          </>
        )}
      </nav>
      <div className="border-t border-[var(--line)] p-3">
        <div className="px-3 py-2">
          <div className="truncate text-sm font-medium text-gray-900">{p.user.name}</div>
          <div className="truncate text-xs text-gray-500">{p.user.role}</div>
        </div>
        <div className="flex gap-1">
          <form action={p.switchLocale} className="flex-1">
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">
              <Icon name="globe" className="h-4 w-4" /> {p.labels.switchLang}
            </button>
          </form>
          <form action={p.logout} className="flex-1">
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">
              <Icon name="logout" className="h-4 w-4" /> {p.labels.logout}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/** Desktop: fixed sidebar. Phone: top bar + slide-in drawer. */
export function SideNav(p: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="no-print fixed inset-y-0 start-0 z-30 hidden w-64 border-e border-[var(--line)] bg-white lg:block">
        <Panel p={p} />
      </aside>

      <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--line)] bg-white px-4 py-3 lg:hidden">
        <button onClick={() => setOpen(true)} aria-label={p.labels.openMenu} className="rounded-lg p-1.5 text-gray-700 hover:bg-gray-100">
          <Icon name="menu" className="h-6 w-6" />
        </button>
        <div className="min-w-0 truncate text-sm font-semibold">{p.company}</div>
      </header>

      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 start-0 w-72 max-w-[85%] bg-white shadow-xl">
            <button onClick={() => setOpen(false)} aria-label={p.labels.closeMenu} className="absolute end-3 top-4 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100">
              <Icon name="close" className="h-5 w-5" />
            </button>
            <Panel p={p} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
