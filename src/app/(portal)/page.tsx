import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime, formatHijri } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";

export default async function Home() {
  const s = await requireStaff();
  const { t, locale } = await getDict();
  const { data: branch } = s.branchId
    ? await db().from("locations").select("name_ar, name_en").eq("id", s.branchId).maybeSingle()
    : { data: null };
  const now = new Date();
  const links = [
    { href: "/company", label: t.home.company, ok: s.perms.has("settings.edit") },
    { href: "/locations", label: t.home.locations, ok: s.perms.has("locations.edit") },
    { href: "/permissions", label: t.home.permissions, ok: s.perms.has("permissions.edit") },
    { href: "/staff", label: t.menu.staff, ok: s.perms.has("staff.view") },
  ].filter((l) => l.ok);
  return (
    <>
      <PageHeader title={`${t.home.welcome}، ${s.fullName}`} t={t} />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card">
          <div className="text-sm text-gray-500">{t.home.today}</div>
          <div className="text-lg font-semibold">{formatDateTime(now, locale)}</div>
          <div className="text-sm text-gray-500">{formatHijri(now, locale)}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500">{t.home.role}</div>
          <div className="text-lg font-semibold">{t.roles[s.role]}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500">{t.home.branch}</div>
          <div className="text-lg font-semibold">{branch ? (locale === "ar" ? branch.name_ar : branch.name_en || branch.name_ar) : "—"}</div>
        </div>
      </div>
      {links.length > 0 && (
        <div className="card mt-4">
          <h2 className="mb-2 font-semibold">{t.home.admin}</h2>
          <div className="flex flex-wrap gap-2">
            {links.map((l) => <Link key={l.href} href={l.href} className="btn-ghost">{l.label}</Link>)}
          </div>
        </div>
      )}
    </>
  );
}
