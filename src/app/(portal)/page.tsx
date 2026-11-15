import { requireStaff } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { Overview, type OverviewLoc } from "@/components/Overview";

export default async function Home() {
  const s = await requireStaff();
  const { t, locale } = await getDict();
  const seeAll = s.role === "owner" || s.perms.has("sales.view_all_branches");
  const [{ data: locData }, { data: staffData }, { data: webSetting }] = await Promise.all([
    db().from("locations").select("id, code, name_ar, name_en, kind, uses_pos, active").order("kind").order("code"),
    seeAll ? db().from("profiles").select("branch_id, active") : Promise.resolve({ data: [] as { branch_id: string | null; active: boolean }[] }),
    db().from("settings").select("value").eq("key", "website_stock_location").maybeSingle(),
  ]);
  return (
    <Overview
      s={s}
      t={t}
      locale={locale}
      now={new Date()}
      locs={(locData ?? []) as OverviewLoc[]}
      staff={staffData ?? []}
      webLocId={typeof webSetting?.value === "string" ? webSetting.value : null}
    />
  );
}
