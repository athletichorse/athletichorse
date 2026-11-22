import { redirect } from "next/navigation";
import { requireStaff, type Staff } from "./auth";
import { db } from "./supabase/admin";
import type { PermissionKey } from "./permissions";

/** Reports need "reports.view" (plus any extra permission); branches are the ones this person may see. */
export async function reportAccess(locale: string, extra?: PermissionKey) {
  const me: Staff = await requireStaff();
  if (!me.perms.has("reports.view")) redirect("/forbidden?k=reports.view");
  if (extra && !me.perms.has(extra)) redirect(`/forbidden?k=${extra}`);
  const { data: locs } = await db().from("locations").select("id, code, name_en, name_ar, kind, uses_pos").order("code");
  const seeAll = me.locations === "all" || me.perms.has("sales.view_all_branches");
  const view = (locs ?? []).filter((l) => seeAll || (me.locations as string[]).includes(l.id));
  const name = (id: string) => { const l = locs?.find((x) => x.id === id); return l ? (locale === "ar" && l.name_ar) || l.name_en : "—"; };
  return { me, locs: locs ?? [], view, name, branches: view.map((l) => ({ id: l.id, name: (locale === "ar" && l.name_ar) || l.name_en })) };
}
