import Link from "next/link";

/**
 * Section tabs. Phones: wrapping chips, so every tab stays visible (nothing slides or gets
 * cut off). Larger screens: the usual underlined tabs.
 */
export function TabNav({ tabs, active }: { tabs: readonly (readonly [string, string, string])[]; active: string }) {
  return (
    <nav className="no-print mb-4 flex flex-wrap gap-2 sm:gap-1 sm:border-b sm:border-[var(--line)]">
      {tabs.map(([k, href, label]) => {
        const on = active === k;
        return (
          <Link key={k} href={href} aria-current={on ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap sm:-mb-px sm:rounded-none sm:border-0 sm:border-b-2 sm:bg-transparent sm:px-3 sm:py-2 ${
              on ? "border-[var(--brand)] bg-[var(--brand)] text-white sm:border-[var(--brand)] sm:text-[var(--brand)]" : "border-[var(--line)] bg-white text-gray-700 sm:border-transparent sm:text-gray-600 sm:hover:text-gray-900"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
