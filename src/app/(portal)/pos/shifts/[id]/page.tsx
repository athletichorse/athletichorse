import Link from "next/link";
import { notFound } from "next/navigation";
import { canUseLocation, requireStaff } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { drawerReport } from "@/lib/shift-report";
import { PageHeader } from "@/components/PageHeader";
import { DrawerReportView } from "@/components/DrawerReportView";

export const dynamic = "force-dynamic";

/** One shift's report: your own shift, or any shift with "closed shifts". */
export default async function ShiftReportPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireStaff();
  const { t, locale } = await getDict();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: s } = await db().from("pos_shifts").select("*").eq("id", id).maybeSingle();
  if (!s || !canUseLocation(me, s.location_id) || (s.opened_by !== me.id && !me.perms.has("pos.past_shifts"))) notFound();
  const [{ data: loc }, { data: who }, { data: types }, { data: methods }] = await Promise.all([
    db().from("locations").select("name_en, name_ar").eq("id", s.location_id).maybeSingle(),
    db().from("profiles").select("full_name").eq("id", s.opened_by).maybeSingle(),
    db().from("expense_types").select("id, name_en, name_ar"),
    db().from("payment_methods").select("code, name_en, name_ar"),
  ]);
  const typeName = (tid: string | null) => { const x = types?.find((y) => y.id === tid); return x ? (locale === "ar" && x.name_ar) || x.name_en : "—"; };
  const methodName = (c: string) => { const m = methods?.find((x) => x.code === c); return m ? (locale === "ar" ? m.name_ar : m.name_en) : c; };
  const r = await drawerReport([id], typeName);
  const X = t.pos.extra;
  return (
    <>
      <PageHeader title={X.shiftReport} subtitle={`${loc ? (locale === "ar" ? loc.name_ar : loc.name_en) : ""} · ${who?.full_name ?? ""} · ${X.opened} ${formatDateTime(new Date(s.opened_at), locale)}${s.closed_at ? ` · ${X.closed} ${formatDateTime(new Date(s.closed_at), locale)}` : ""}`} t={t} filename="shift-report">
        <Link href={me.perms.has("pos.past_shifts") ? "/pos/shifts" : "/pos"} className="btn-ghost no-print">←</Link>
      </PageHeader>
      <DrawerReportView t={t} r={r} methodName={methodName} counted={s.counted_cash === null ? null : Number(s.counted_cash)} />
    </>
  );
}
