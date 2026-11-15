import Link from "next/link";
import type { Dict, Locale } from "@/i18n";
import type { Staff } from "@/lib/auth";
import { formatDateTime, formatHijri } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { buildNav } from "@/components/menu";
import { Icon, type IconName } from "@/components/icons";

export type OverviewLoc = { id: string; code: string; name_ar: string; name_en: string; kind: "branch" | "warehouse" | "sub_store"; uses_pos: boolean; active: boolean };
type Loc = OverviewLoc;

function Stat({ label, value, icon, href, warn }: { label: string; value: string | number; icon: IconName; href?: string; warn?: boolean }) {
  const body = (
    <div className={`card flex h-full flex-col gap-3 p-4 transition sm:flex-row sm:items-center sm:gap-4 sm:p-5 ${href ? "hover:border-[var(--brand)] hover:shadow-md" : ""} ${warn ? "border-amber-200 bg-amber-50" : ""}`}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
        <Icon name={icon} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-semibold text-gray-900">{value}</div>
        <div className="truncate text-sm text-gray-500">{label}</div>
      </div>
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

/** Home dashboard. Owners/managers with all-branch access get the full overview. */
export type CatalogStats = { products: number; website: number; missingSku: number; lastSync: { started_at: string; status: string; error: string | null } | null };

export function Overview({ s, t, locale, now, locs, staff, webLocId, catalog }: {
  s: Pick<Staff, "fullName" | "role" | "branchId" | "perms">;
  t: Dict;
  locale: Locale;
  now: Date;
  locs: Loc[];
  staff: { branch_id: string | null; active: boolean }[];
  webLocId: string | null;
  catalog: CatalogStats;
}) {
  const seeAll = s.role === "owner" || s.perms.has("sales.view_all_branches");
  const name = (l?: Loc) => (l ? (locale === "ar" ? l.name_ar : l.name_en || l.name_ar) : "—");
  const myBranch = locs.find((l) => l.id === s.branchId);
  const webLoc = locs.find((l) => l.id === webLocId);
  const shortcuts = buildNav(t, s.perms).main.filter((i) => i.href !== "/");
  const kindBadge = (k: Loc["kind"]) => (k === "branch" ? "badge-green" : k === "warehouse" ? "badge-blue" : "badge-gray");

  return (
    <>
      <PageHeader
        title={`${t.home.welcome}${locale === "ar" ? "، " : ", "}${s.fullName}`}
        subtitle={`${formatDateTime(now, locale)} · ${formatHijri(now, locale)}`}
        t={t}
        filename="overview"
      />

      {seeAll ? (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            <Stat label={t.home.branches} value={locs.filter((l) => l.kind === "branch" && l.active).length} icon="company" href={s.perms.has("locations.edit") ? "/locations" : undefined} />
            <Stat label={t.home.warehouses} value={locs.filter((l) => l.kind !== "branch" && l.active).length} icon="stock" href={s.perms.has("locations.edit") ? "/locations" : undefined} />
            <Stat label={t.home.activeStaff} value={staff.filter((p) => p.active).length} icon="staff" href="/staff" />
            <Stat label={t.products.title} value={catalog.products.toLocaleString("en-US")} icon="products" href="/products" />
            <Stat label={t.home.fromWebsite} value={catalog.website.toLocaleString("en-US")} icon="web" href="/products" />
            <Stat label={t.products.missingSku} value={catalog.missingSku.toLocaleString("en-US")} icon="audit" href="/products?f=missing" warn={catalog.missingSku > 0} />
          </div>

          <div className="card mb-6 grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700"><Icon name="web" /></div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-gray-500">{t.home.websiteStock}</div>
                <div className="text-lg font-semibold text-gray-900">{webLoc ? name(webLoc) : t.home.notSet}</div>
              </div>
              {s.perms.has("settings.edit") && <Link href="/company#online" className="btn-ghost no-print">{t.edit}</Link>}
            </div>
            <div className="flex items-center gap-4 border-t border-[var(--line)] pt-4 sm:border-s sm:border-t-0 sm:ps-4 sm:pt-0">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-gray-500">{t.products.lastSync}</div>
                <div className="flex flex-wrap items-center gap-2 font-semibold text-gray-900">
                  {catalog.lastSync ? (
                    <>
                      <span>{formatDateTime(new Date(catalog.lastSync.started_at), locale)}</span>
                      <span className={catalog.lastSync.status === "ok" ? "badge-green" : catalog.lastSync.status === "error" ? "badge bg-red-50 text-red-700" : "badge-blue"}>
                        {catalog.lastSync.status === "ok" ? t.products.syncOk : catalog.lastSync.status === "error" ? t.products.syncError : t.products.syncRunning}
                      </span>
                    </>
                  ) : (
                    t.products.never
                  )}
                </div>
                {catalog.lastSync?.status === "error" && <p className="mt-1 line-clamp-2 text-xs text-red-600">{catalog.lastSync.error}</p>}
              </div>
              <Link href="/products" className="btn-ghost no-print">{t.home.manage}</Link>
            </div>
          </div>

          <div className="card mb-6 overflow-hidden p-0">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{t.home.allLocations}</h2>
                <p className="text-sm text-gray-500">{t.home.overviewHint}</p>
              </div>
              {s.perms.has("locations.edit") && <Link href="/locations" className="btn-ghost no-print">{t.home.manage}</Link>}
            </div>
            <div className="overflow-x-auto">
              <table className="table" data-export>
                <thead>
                  <tr><th>{t.locations.nameEn}</th><th>{t.locations.code}</th><th>{t.locations.kind}</th><th>{t.locations.usesPos}</th><th>{t.home.staffHere}</th><th>{t.home.status}</th></tr>
                </thead>
                <tbody>
                  {locs.map((l) => (
                    <tr key={l.id}>
                                            <td className="cell-title font-medium">
                        {name(l)}
                        {webLoc?.id === l.id && <Icon name="web" className="ms-2 inline h-4 w-4 text-sky-600" />}
                      </td>
                      <td data-label={t.locations.code} className="font-mono text-xs text-gray-500">{l.code}</td>
                      <td data-label={t.locations.kind}><span className={kindBadge(l.kind)}>{t.locations.kinds[l.kind]}</span></td>
                      <td data-label={t.locations.usesPos}>{l.uses_pos ? t.yes : t.no}</td>
                      <td data-label={t.home.staffHere}>{staff.filter((p) => p.branch_id === l.id && p.active).length}</td>
                      <td data-label={t.home.status}>{l.active ? <span className="badge-green">{t.active}</span> : <span className="badge-gray">{t.inactive}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <Stat label={t.home.role} value={t.roles[s.role]} icon="staff" />
          <Stat label={t.home.branch} value={name(myBranch)} icon="company" />
        </div>
      )}

      {shortcuts.length > 0 && (
        <div className="no-print">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-gray-500 uppercase">{t.home.quickActions}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {shortcuts.map((i) => (
              <Link key={i.href} href={i.href} className="card flex flex-col items-start gap-3 p-4 transition hover:border-[var(--brand)] hover:shadow-md">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-700"><Icon name={i.icon} /></span>
                <span className="text-sm font-medium text-gray-900">{i.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
