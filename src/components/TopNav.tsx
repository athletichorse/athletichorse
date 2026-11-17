"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { activeFor, type Section } from "./menu";

type Props = {
  sections: Section[];
  company: string;
  user: { name: string; role: string };
  locale: "ar" | "en";
  settings: { href: string; label: string } | null;
  labels: { home: string; logout: string; sections: string };
  logout: () => Promise<void>;
};

/** Logging out: forget the Cashier page saved for offline use on this device. */
function forgetSavedPages() {
  try { void caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("pages-")).map((k) => caches.delete(k)))); } catch { /* no Cache API */ }
}

/** Language: both choices always shown, the current one highlighted (plain links = full page load). */
function LangToggle({ current }: { current: "ar" | "en" }) {
  const path = usePathname();
  const opt = (to: "ar" | "en", label: string) => (
    <a href={`/lang?to=${to}&next=${encodeURIComponent(path || "/")}`} lang={to} aria-current={current === to ? "true" : undefined} data-testid={`lang-${to}`}
      className={`rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap sm:text-sm ${current === to ? "bg-[var(--brand)] text-white" : "text-gray-700 hover:bg-gray-100"}`}>{label}</a>
  );
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-[var(--line)] p-0.5">
      {opt("en", "English")}
      {opt("ar", "العربية")}
    </div>
  );
}

/**
 * Top of every page: logo (Home), language, settings, log out; then the 6 main sections;
 * then the pages of the current section as tabs. Phones: sections in a 3 × 2 grid, tabs wrap —
 * nothing slides off the screen.
 */
export function TopNav(p: Props) {
  const path = usePathname() || "/";
  const { section, tab } = activeFor(p.sections, path);
  return (
    <header className="no-print border-b border-[var(--line)] bg-white" data-testid="topbar">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 lg:px-8">
        <Link href="/" aria-label={p.labels.home} className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.png" alt={p.company} className="h-8 w-auto sm:h-10" />
        </Link>
        <div className="flex-1" />
        <div className="hidden min-w-0 text-end leading-tight sm:block">
          <div className="truncate text-sm font-medium text-gray-900">{p.user.name}</div>
          <div className="truncate text-xs text-gray-500">{p.user.role}</div>
        </div>
        <LangToggle current={p.locale} />
        {p.settings && (
          <Link href={p.settings.href} aria-label={p.settings.label} title={p.settings.label} data-testid="settings"
            className={`rounded-lg p-2 hover:bg-gray-100 ${path.startsWith(p.settings.href) ? "text-[var(--brand)]" : "text-gray-600"}`}>
            <Icon name="settings" className="h-5 w-5" />
          </Link>
        )}
        <form action={p.logout} onSubmit={forgetSavedPages}>
          <button aria-label={p.labels.logout} title={p.labels.logout} data-testid="logout" className="flex items-center gap-1.5 rounded-lg p-2 text-sm text-gray-600 hover:bg-gray-100">
            <Icon name="logout" className="h-5 w-5" /><span className="hidden lg:inline">{p.labels.logout}</span>
          </button>
        </form>
      </div>

      <nav aria-label={p.labels.sections} data-testid="sections" className="mx-auto grid max-w-6xl grid-cols-3 gap-1 px-3 pb-2 sm:flex sm:flex-wrap sm:gap-1 sm:px-4 lg:px-8">
        {p.sections.map((s) => {
          const on = section?.key === s.key;
          return (
            <Link key={s.key} href={s.href} aria-current={on ? "page" : undefined} data-section={s.key}
              className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-center text-xs font-medium sm:flex-row sm:px-3 sm:text-sm ${on ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}>
              <Icon name={s.icon} className="h-5 w-5 shrink-0" />
              <span>{s.label}</span>
            </Link>
          );
        })}
      </nav>

      {section && section.tabs.length > 1 && (
        <nav data-testid="subtabs" className="mx-auto flex max-w-6xl flex-wrap gap-2 border-t border-[var(--line)] px-4 py-2 sm:gap-1 lg:px-8">
          {section.tabs.map((x) => {
            const on = tab === x.href;
            return (
              <Link key={x.href} href={x.href} aria-current={on ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap ${on ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-[var(--line)] bg-white text-gray-700 hover:bg-gray-50"}`}>
                {x.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
