import type { Dict } from "@/i18n";

/** Centered card used by the login and first-owner setup screens. */
export function AuthCard({ t, title, subtitle, children, path = "/login" }: { t: Dict; title: string; subtitle?: string; children: React.ReactNode; path?: string }) {
  const other = t.switchLang === "English" ? "en" : "ar";
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--brand)] text-sm font-bold text-white">S</div>
            <span className="text-sm font-semibold text-gray-900">{t.appName}</span>
          </div>
          <a href={`/lang?to=${other}&next=${encodeURIComponent(path)}`} className="rounded-lg px-2 py-1 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand-soft)]">{t.switchLang}</a>
        </div>
        <div className="card p-6">
          <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
