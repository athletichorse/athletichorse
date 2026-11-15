import { requireStaff } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { BRAND } from "@/lib/product-import";
import { SideNav } from "@/components/SideNav";
import { buildNav } from "@/components/menu";
import { logoutAction } from "@/app/actions/auth";
import { ReloadOnStaleVersion } from "@/components/ReloadOnStaleVersion";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const { t, locale } = await getDict();
  const { data: c } = await db().from("company").select("legal_name_ar, legal_name_en").eq("id", 1).maybeSingle();
  const raw = (locale === "ar" ? c?.legal_name_ar : c?.legal_name_en) || c?.legal_name_en || "";
  const company = !raw || raw.startsWith("[") ? (locale === "ar" ? BRAND.ar : BRAND.en) : raw;
  const { main, admin } = buildNav(t, staff.perms, staff.role);
  return (
    <div className="min-h-screen">
      <ReloadOnStaleVersion />
      <SideNav
        main={main}
        admin={admin}
        company={company}
        user={{ name: staff.fullName, role: t.roles[staff.role] }}
        labels={{ admin: t.nav.admin, openMenu: t.nav.openMenu, closeMenu: t.nav.closeMenu, switchLang: t.switchLang, logout: t.logout, soon: t.soon }}
        otherLocale={locale === "ar" ? "en" : "ar"}
        logout={logoutAction}
      />
      <div className="lg:ps-64">
        <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
