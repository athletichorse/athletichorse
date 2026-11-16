import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { riyadhDate } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { StaffTabs } from "@/components/StaffTabs";
import { addAdjustmentAction, addAdvanceAction } from "@/app/actions/payroll";

export const dynamic = "force-dynamic";

/** Advances (paid off monthly), bonuses and deductions. */
export default async function AdvancesPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requirePermission("staff.payroll");
  const { t } = await getDict();
  const P = t.pay;
  const sp = await searchParams;
  const canEdit = me.perms.has("staff.payroll_edit");
  const [{ data: people }, { data: adv }, { data: adj }, { data: taken }] = await Promise.all([
    db().from("profiles").select("id, full_name").eq("active", true).order("full_name"),
    db().from("advances").select("id, profile_id, amount, installment, given_on, note").order("given_on", { ascending: false }).limit(200),
    db().from("pay_adjustments").select("id, profile_id, month, kind, amount, note").order("month", { ascending: false }).limit(200),
    db().from("payroll_lines").select("profile_id, advance_deduction"),
  ]);
  const name = (id: string) => people?.find((p) => p.id === id)?.full_name ?? "—";
  const owed = (id: string) => (adv ?? []).filter((a) => a.profile_id === id).reduce((s, a) => s + Number(a.amount), 0) - (taken ?? []).filter((x) => x.profile_id === id).reduce((s, x) => s + Number(x.advance_deduction), 0);
  const err = sp.err ? (P.errors as Record<string, string>)[sp.err] ?? sp.err : null;
  const pick = <select name="profile_id" className="input" required><option value="">{P.employee}</option>{(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>;
  return (
    <>
      <PageHeader title={P.tabs.advances} t={t} filename="advances" />
      <StaffTabs t={t} perms={me.perms} active="advances" />
      {err && <p className="alert-err">{err}</p>}
      {sp.ok && <p className="alert-ok">{P.saved}</p>}
      {canEdit && (
        <div className="no-print mb-6 grid gap-4 lg:grid-cols-2">
          <form action={addAdvanceAction} className="card grid gap-3 sm:grid-cols-2">
            <h2 className="card-title sm:col-span-2">{P.advance}</h2>
            <div className="sm:col-span-2">{pick}</div>
            <input name="amount" placeholder={P.amount} className="input" dir="ltr" inputMode="decimal" required />
            <input name="installment" placeholder={P.installment} className="input" dir="ltr" inputMode="decimal" required />
            <input name="note" placeholder={P.note} className="input sm:col-span-2" />
            <button className="btn-primary sm:col-span-2">{P.add}</button>
          </form>
          <form action={addAdjustmentAction} className="card grid gap-3 sm:grid-cols-2">
            <h2 className="card-title sm:col-span-2">{P.bonus} / {P.deduction}</h2>
            <div className="sm:col-span-2">{pick}</div>
            <select name="kind" className="input"><option value="bonus">{P.bonus}</option><option value="deduction">{P.deduction}</option></select>
            <input type="month" name="month" defaultValue={riyadhDate(new Date()).slice(0, 7)} className="input" dir="ltr" />
            <input name="amount" placeholder={P.amount} className="input" dir="ltr" inputMode="decimal" required />
            <input name="note" placeholder={P.note} className="input" />
            <button className="btn-primary sm:col-span-2">{P.add}</button>
          </form>
        </div>
      )}
      <section className="card mb-4 overflow-hidden p-0"><h2 className="card-title px-5 pt-5">{P.advance}</h2><div className="overflow-x-auto"><table className="table" data-export>
        <thead><tr><th>{P.employee}</th><th>{P.amount}</th><th>{P.installment}</th><th>{P.given}</th><th>{P.advanceLeft}</th><th>{P.note}</th></tr></thead>
        <tbody>{(adv ?? []).length === 0 && <tr><td colSpan={6} className="text-gray-500">{P.none}</td></tr>}
          {(adv ?? []).map((a) => <tr key={a.id}><td className="cell-title">{name(a.profile_id)}</td><td data-label={P.amount} dir="ltr">{Number(a.amount).toFixed(2)}</td><td data-label={P.installment} dir="ltr">{Number(a.installment).toFixed(2)}</td><td data-label={P.given}>{String(a.given_on).slice(0, 10)}</td><td data-label={P.advanceLeft} dir="ltr">{owed(a.profile_id).toFixed(2)}</td><td data-label={P.note}>{a.note}</td></tr>)}</tbody>
      </table></div></section>
      <section className="card overflow-hidden p-0"><h2 className="card-title px-5 pt-5">{P.bonus} / {P.deduction}</h2><div className="overflow-x-auto"><table className="table">
        <thead><tr><th>{P.employee}</th><th>{P.month}</th><th>{P.kind}</th><th>{P.amount}</th><th>{P.note}</th></tr></thead>
        <tbody>{(adj ?? []).length === 0 && <tr><td colSpan={5} className="text-gray-500">{P.none}</td></tr>}
          {(adj ?? []).map((a) => <tr key={a.id}><td className="cell-title">{name(a.profile_id)}</td><td data-label={P.month}>{String(a.month).slice(0, 7)}</td><td data-label={P.kind}>{a.kind === "bonus" ? P.bonus : P.deduction}</td><td data-label={P.amount} dir="ltr">{Number(a.amount).toFixed(2)}</td><td data-label={P.note}>{a.note}</td></tr>)}</tbody>
      </table></div></section>
    </>
  );
}
