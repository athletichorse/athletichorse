import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

/** Closed (and open) shifts with expected / counted / difference. */
export default async function ShiftsPage() {
  const me = await requirePermission("pos.past_shifts");
  const { t, locale } = await getDict();
  const X = t.pos.extra;
  const { data: locs } = await db().from("locations").select("id, name_en, name_ar");
  const { data: people } = await db().from("profiles").select("id, full_name");
  let q = db().from("pos_shifts").select("id, location_id, opened_by, opened_at, closed_at, status, expected_cash, counted_cash, difference").order("opened_at", { ascending: false }).limit(200);
  if (me.locations !== "all") q = q.in("location_id", me.locations);
  const { data } = await q;
  const lname = (id: string) => { const l = locs?.find((x) => x.id === id); return l ? (locale === "ar" ? l.name_ar : l.name_en) : "—"; };
  return (
    <>
      <PageHeader title={X.pastShifts} t={t} filename="shifts">
      </PageHeader>
      <div className="card overflow-hidden p-0"><div className="overflow-x-auto">
        <table className="table" data-export>
          <thead><tr><th>{X.branch}</th><th>{X.cashier}</th><th>{X.opened}</th><th>{X.closed}</th><th>{X.expected}</th><th>{X.counted}</th><th>{X.difference}</th><th></th></tr></thead>
          <tbody>
            {(data ?? []).length === 0 && <tr><td colSpan={8} className="py-10 text-center text-gray-500">{X.none}</td></tr>}
            {(data ?? []).map((s) => (
              <tr key={s.id}>
                <td className="cell-title">{lname(s.location_id)}</td>
                <td data-label={X.cashier}>{people?.find((p) => p.id === s.opened_by)?.full_name ?? "—"}</td>
                <td data-label={X.opened} className="text-xs">{formatDateTime(new Date(s.opened_at), locale)}</td>
                <td data-label={X.closed} className="text-xs">{s.closed_at ? formatDateTime(new Date(s.closed_at), locale) : <span className="badge-green">{t.pos.shiftOpen}</span>}</td>
                <td data-label={X.expected} dir="ltr">{s.expected_cash ?? "—"}</td>
                <td data-label={X.counted} dir="ltr">{s.counted_cash ?? "—"}</td>
                <td data-label={X.difference} dir="ltr" className={Number(s.difference) < 0 ? "text-red-600" : Number(s.difference) > 0 ? "text-amber-700" : ""}>{s.difference ?? "—"}</td>
                <td><Link href={`/pos/shifts/${s.id}`} className="btn-ghost no-print py-1.5">{X.open}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </>
  );
}
