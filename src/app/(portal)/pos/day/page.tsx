import { requireStaff } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { riyadhDate } from "@/lib/time";
import { drawerReport } from "@/lib/shift-report";
import { PageHeader } from "@/components/PageHeader";
import { DrawerReportView } from "@/components/DrawerReportView";

export const dynamic = "force-dynamic";

/** End of day: every shift opened that day (Riyadh), one branch or all. */
export default async function EndOfDayPage({ searchParams }: { searchParams: Promise<{ date?: string; loc?: string }> }) {
  const me = await requireStaff();
  if (!me.perms.has("pos.past_shifts") && !me.perms.has("pos.shift")) redirect("/forbidden");
  const { t, locale } = await getDict();
  const X = t.pos.extra;
  const sp = await searchParams;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : riyadhDate(new Date());
  const { data: locs } = await db().from("locations").select("id, name_en, name_ar").eq("uses_pos", true).order("code");
  const mine = (locs ?? []).filter((l) => me.locations === "all" || me.locations.includes(l.id));
  const loc = mine.find((l) => l.id === sp.loc)?.id ?? "";
  const from = new Date(`${day}T00:00:00+03:00`).toISOString(), to = new Date(`${day}T23:59:59.999+03:00`).toISOString();
  let q = db().from("pos_shifts").select("id, location_id, opened_by, counted_cash").gte("opened_at", from).lte("opened_at", to);
  q = loc ? q.eq("location_id", loc) : q.in("location_id", mine.map((l) => l.id).concat(["00000000-0000-0000-0000-000000000000"]));
  if (!me.perms.has("pos.past_shifts")) q = q.eq("opened_by", me.id);
  const { data: shifts } = await q;
  const [{ data: types }, { data: methods }] = await Promise.all([db().from("expense_types").select("id, name_en, name_ar"), db().from("payment_methods").select("code, name_en, name_ar")]);
  const typeName = (tid: string | null) => { const x = types?.find((y) => y.id === tid); return x ? (locale === "ar" && x.name_ar) || x.name_en : "—"; };
  const methodName = (c: string) => { const m = methods?.find((x) => x.code === c); return m ? (locale === "ar" ? m.name_ar : m.name_en) : c; };
  const r = await drawerReport((shifts ?? []).map((s) => s.id), typeName);
  const counted = (shifts ?? []).every((s) => s.counted_cash !== null) && (shifts ?? []).length ? (shifts ?? []).reduce((a, s) => a + Number(s.counted_cash), 0) : null;
  return (
    <>
      <PageHeader title={`${X.endOfDay} · ${day}`} t={t} filename={`end-of-day-${day}`} />
      <form className="no-print card mb-4 flex flex-wrap items-end gap-3" action="/pos/day">
        <div><label className="label">{X.date}</label><input type="date" name="date" defaultValue={day} className="input" dir="ltr" /></div>
        <div><label className="label">{X.branch}</label><select name="loc" defaultValue={loc} className="input"><option value="">{X.allBranches}</option>{mine.map((l) => <option key={l.id} value={l.id}>{locale === "ar" ? l.name_ar : l.name_en}</option>)}</select></div>
        <button className="btn-primary">{X.show}</button>
      </form>
      <DrawerReportView t={t} r={r} methodName={methodName} counted={counted} />
    </>
  );
}
