import type { Dict } from "@/i18n";

/** Centered card used by the login and first-owner setup screens. */
export function AuthCard({ t, title, subtitle, children, path = "/login" }: { t: Dict; title: string; subtitle?: string; children: React.ReactNode; path?: string }) {
  const other = t.switchLang === "English" ? "en" : "ar";
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo.png" alt="Alhisan Alriyadi" className="h-10 w-auto" />
          </div>
          <div className="flex gap-1 rounded-lg border border-[var(--line)] p-0.5 text-sm font-medium">
            {(["en", "ar"] as const).map((to) => (
              <a key={to} href={`/lang?to=${to}&next=${encodeURIComponent(path)}`} lang={to} className={`rounded-md px-2 py-1 ${other === to ? "text-gray-700 hover:bg-gray-100" : "bg-[var(--brand)] text-white"}`}>{to === "en" ? "English" : "العربية"}</a>
            ))}
          </div>
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
