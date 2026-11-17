import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { saveEmployeeAction } from "@/app/actions/payroll";

export const dynamic = "force-dynamic";

/** Pay settings per staff member: salary, hours, commission (6/1000 or 1%), regularity bonus, food allowance. */
export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requirePermission("staff.payroll_edit");
  const { t } = await getDict();
  const P = t.pay;
  const sp = await searchParams;
  const [{ data: people }, { data: emps }] = await Promise.all([
    db().from("profiles").select("id, full_name, username, role, active").order("full_name"),
    db().from("employees").select("*"),
  ]);
  const err = sp.err ? (P.errors as Record<string, string>)[sp.err] ?? sp.err : null;
  return (
    <>
      <PageHeader title={P.tabs.employees} t={t} filename="pay-settings" />
      {err && <p className="alert-err">{err}</p>}
      {sp.ok && <p className="alert-ok">{P.saved}</p>}
      <div className="space-y-3">
        {(people ?? []).map((p) => {
          const e = emps?.find((x) => x.profile_id === p.id);
          const rate = e ? `${Math.round(Number(e.commission_rate) * 1_000_000) / 1000}/1000` : "0";
          return (
            <form key={p.id} id={p.id} action={saveEmployeeAction} className="card">
              <input type="hidden" name="profile_id" value={p.id} />
              <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{p.full_name} <span className="text-xs text-gray-500">@{p.username} · {t.roles[p.role as keyof typeof t.roles]}</span></h2>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_salesperson" defaultChecked={e?.is_salesperson ?? true} className="h-4 w-4 accent-[var(--brand)]" /> {P.salesperson}</label></div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div><label className="label">{P.salary}</label><input name="monthly_salary" defaultValue={e?.monthly_salary ?? "0"} className="input" dir="ltr" inputMode="decimal" /></div>
                <div><label className="label">{P.hours}</label><input name="daily_hours" defaultValue={e?.daily_hours ?? "8"} className="input" dir="ltr" inputMode="decimal" /></div>
                <div><label className="label">{P.rate}</label><input name="commission_rate" defaultValue={rate} className="input" dir="ltr" /></div>
                <div><label className="label">{P.scope}</label><select name="commission_scope" defaultValue={e?.commission_scope ?? "own"} className="input"><option value="own">{P.scopeOwn}</option><option value="all">{P.scopeAll}</option></select></div>
                <div><label className="label">{P.regularity}</label><input name="regularity_bonus" defaultValue={e?.regularity_bonus ?? "0"} className="input" dir="ltr" inputMode="decimal" /></div>
                <div><label className="label">{P.food}</label><input name="food_allowance" defaultValue={e?.food_allowance ?? "0"} className="input" dir="ltr" inputMode="decimal" /></div>
                <div className="sm:col-span-2"><label className="label">{P.bank}</label><input name="bank_account" defaultValue={e?.bank_account ?? ""} className="input" dir="ltr" /></div>
              </div>
              <div className="mt-3 flex justify-end"><button className="btn-primary">{P.save}</button></div>
            </form>
          );
        })}
      </div>
    </>
  );
}
