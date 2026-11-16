import { requireStaff } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { BRAND } from "@/lib/product-import";
import { TopNav } from "@/components/TopNav";
import { ShowMessage } from "@/components/ShowMessage";
import { buildSections } from "@/components/menu";
import { TILL_ROLES } from "@/lib/permissions";
import { logoutAction } from "@/app/actions/auth";
import { ReloadOnStaleVersion } from "@/components/ReloadOnStaleVersion";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const { t, locale } = await getDict();
  const { data: c } = await db().from("company").select("legal_name_ar, legal_name_en, vat_number, cr_number, logo_url").eq("id", 1).maybeSingle();
  const raw = (locale === "ar" ? c?.legal_name_ar : c?.legal_name_en) || c?.legal_name_en || "";
  const company = !raw || raw.startsWith("[") ? (locale === "ar" ? BRAND.ar : BRAND.en) : raw;
  const sections = buildSections(t, staff.perms, staff.role);
  const settings = staff.perms.has("settings.edit") && !TILL_ROLES.includes(staff.role) ? { href: "/company", label: t.nav.company } : null;
  return (
    <div className="min-h-screen">
      <ReloadOnStaleVersion />
      <TopNav
        sections={sections}
        company={company}
        user={{ name: staff.fullName, role: t.roles[staff.role] }}
        locale={locale}
        settings={settings}
        labels={{ home: t.menu.home, logout: t.logout, sections: t.nav.main }}
        logout={logoutAction}
      />
      <div>
        <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">
          {/* A4 / PDF: logo and company on every printed page (not on the 80 mm receipt) */}
          <header className="print-header mb-4 items-center justify-between border-b border-black pb-2 text-[11px] text-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c?.logo_url && /^https:\/\//.test(c.logo_url) ? c.logo_url : "/brand/logo.png"} alt="" className="h-12 w-auto" />
            <div className="text-end leading-snug">
              <div className="font-semibold">{c?.legal_name_ar || BRAND.ar} · <span dir="ltr">{c?.legal_name_en || BRAND.en}</span></div>
              {(c?.vat_number || c?.cr_number) && <div dir="ltr">{c?.vat_number ? `VAT ${c.vat_number}` : ""}{c?.vat_number && c?.cr_number ? " · " : ""}{c?.cr_number ? `CR ${c.cr_number}` : ""}</div>}
            </div>
          </header>
          {children}
          <ShowMessage />
        </main>
      </div>
    </div>
  );
}
