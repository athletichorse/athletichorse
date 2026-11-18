import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { createExpenseTypeAction, saveExpenseTypeAction } from "@/app/actions/expenses";

export const dynamic = "force-dynamic";

/** Expense types the cashier chooses from (e.g. Transport, Cleaning, Electricity). */
export default async function ExpenseTypesPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requirePermission("settings.edit");
  const { t } = await getDict();
  const E = t.pos.expenses;
  const sp = await searchParams;
  const { data: types } = await db().from("expense_types").select("id, name_en, name_ar, sort, active").order("sort").order("name_en");
  const err = sp.err === "duplicate" ? E.duplicate : sp.err === "name" ? E.nameRequired : sp.err;
  return (
    <>
      <PageHeader title={E.typesTitle} subtitle={E.typesSubtitle} t={t} filename="expense-types" />
      {err && <p className="alert-err">{err}</p>}
      {sp.ok && <p className="alert-ok">{t.saved}</p>}
      <div className="card mb-6 space-y-3">
        {(types ?? []).map((x) => (
          <form key={x.id} action={saveExpenseTypeAction} className="grid gap-2 border-b border-[var(--line)] pb-3 last:border-0 sm:grid-cols-[1fr_1fr_5rem_auto_auto] sm:items-center">
            <input type="hidden" name="id" value={x.id} />
            <input name="name_en" defaultValue={x.name_en} aria-label={E.nameEn} placeholder={E.nameEn} className="input" />
            <input name="name_ar" defaultValue={x.name_ar} aria-label={E.nameAr} placeholder={E.nameAr} className="input" />
            <input name="sort" defaultValue={x.sort} aria-label={E.sort} className="input" dir="ltr" inputMode="numeric" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={x.active} className="h-4 w-4 accent-[var(--brand)]" />{t.active}</label>
            <button className="btn-ghost">{t.save}</button>
          </form>
        ))}
      </div>
      <form action={createExpenseTypeAction} className="card no-print grid max-w-3xl gap-4 sm:grid-cols-3">
        <h2 className="card-title sm:col-span-3">{E.addType}</h2>
        <div><label className="label">{E.nameEn}</label><input name="name_en" className="input" required /></div>
        <div><label className="label">{E.nameAr}</label><input name="name_ar" className="input" /></div>
        <div><label className="label">{E.sort}</label><input name="sort" defaultValue="10" className="input" dir="ltr" inputMode="numeric" /></div>
        <div className="flex justify-end sm:col-span-3"><button className="btn-primary">{t.add}</button></div>
      </form>
    </>
  );
}
