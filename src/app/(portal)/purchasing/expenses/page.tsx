import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { riyadhDate } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { PendingButton } from "@/components/PendingButton";
import { payRecurringAction, saveRecurringAction } from "@/app/actions/recurring-expenses";
import { EXPENSE_METHODS, FREQUENCIES, dueList, perMonth, type Frequency, type Recurring } from "@/lib/recurring";

export const dynamic = "force-dynamic";

type Row = Recurring & { name: string; expense_type_id: string | null; location_id: string | null; payee: string | null; method: string; notes: string };

/** Recurring expenses: what is due / overdue (pay it here), every expense with its schedule, and the payments. */
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requirePermission("purchasing.expenses");
  const { t, locale } = await getDict();
  const E = t.expenses;
  const sp = await searchParams;
  const today = riyadhDate(new Date());
  const year = today.slice(0, 4), month = today.slice(0, 7);
  const [{ data: items }, { data: pays }, { data: types }, { data: locs }] = await Promise.all([
    db().from("recurring_expenses").select("*").order("active", { ascending: false }).order("name"),
    db().from("expense_payments").select("id, recurring_id, period, paid_on, amount, method, ref, created_at").gte("period", `${Number(year) - 2}-01-01`).order("paid_on", { ascending: false }).limit(2000),
    db().from("expense_types").select("id, name_en, name_ar, active").order("sort"),
    db().from("locations").select("id, name_en, name_ar").eq("active", true).order("code"),
  ]);
  const rows = (items ?? []) as Row[];
  const paid = new Set((pays ?? []).map((p) => `${p.recurring_id}|${p.period}`));
  const due = dueList(rows, paid, today);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const tname = (id: string | null) => { const x = types?.find((y) => y.id === id); return x ? (locale === "ar" && x.name_ar) || x.name_en : "—"; };
  const lname = (id: string | null) => { const x = locs?.find((y) => y.id === id); return x ? (locale === "ar" && x.name_ar) || x.name_en : "—"; };
  const f = (x: number) => x.toFixed(2);
  const overdueTotal = due.filter((d) => d.overdue).reduce((a, d) => a + d.amount, 0);
  const dueMonth = due.filter((d) => d.dueOn.startsWith(month)).reduce((a, d) => a + d.amount, 0);
  const paidMonth = (pays ?? []).filter((p) => p.paid_on.startsWith(month)).reduce((a, p) => a + Number(p.amount), 0);
  const monthly = rows.filter((r) => r.active).reduce((a, r) => a + perMonth(r), 0);
  const byMonth = new Map<string, number>();
  for (const p of pays ?? []) if (p.paid_on.startsWith(year)) byMonth.set(p.paid_on.slice(0, 7), (byMonth.get(p.paid_on.slice(0, 7)) ?? 0) + Number(p.amount));
  const err = sp.err ? (E.errors as Record<string, string>)[sp.err] ?? sp.err : null;

  const fields = (r?: Row) => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {r && <input type="hidden" name="id" value={r.id} />}
      <div className="sm:col-span-2"><label className="label" htmlFor={`ex-name-${r?.id ?? "new"}`}>{E.name}</label><input id={`ex-name-${r?.id ?? "new"}`} name="name" className="input" required maxLength={120} defaultValue={r?.name} placeholder={locale === "ar" ? "إيجار المحل" : "Shop rent"} /></div>
      <div><label className="label" htmlFor={`ex-amount-${r?.id ?? "new"}`}>{E.amount}</label><input id={`ex-amount-${r?.id ?? "new"}`} name="amount" className="input" dir="ltr" inputMode="decimal" required defaultValue={r ? Number(r.amount).toFixed(2) : ""} /></div>
      <div><label className="label" htmlFor={`ex-freq-${r?.id ?? "new"}`}>{E.frequency}</label>
        <select id={`ex-freq-${r?.id ?? "new"}`} name="frequency" className="input" defaultValue={r?.frequency ?? "monthly"}>{FREQUENCIES.map((x) => <option key={x} value={x}>{E.frequencies[x]}</option>)}</select></div>
      <div><label className="label" htmlFor={`ex-day-${r?.id ?? "new"}`}>{E.dueDay}</label><input id={`ex-day-${r?.id ?? "new"}`} name="due_day" type="number" min={1} max={28} className="input" dir="ltr" defaultValue={r?.due_day ?? 1} /></div>
      <div><label className="label" htmlFor={`ex-start-${r?.id ?? "new"}`}>{E.startOn}</label><input id={`ex-start-${r?.id ?? "new"}`} name="start_on" type="date" className="input" required defaultValue={r?.start_on ?? `${month}-01`} /></div>
      <div><label className="label" htmlFor={`ex-end-${r?.id ?? "new"}`}>{E.endOn}</label><input id={`ex-end-${r?.id ?? "new"}`} name="end_on" type="date" className="input" defaultValue={r?.end_on ?? ""} /></div>
      <div><label className="label" htmlFor={`ex-method-${r?.id ?? "new"}`}>{E.method}</label>
        <select id={`ex-method-${r?.id ?? "new"}`} name="method" className="input" defaultValue={r?.method ?? "bank"}>{EXPENSE_METHODS.map((x) => <option key={x} value={x}>{E.methods[x]}</option>)}</select></div>
      <div><label className="label" htmlFor={`ex-type-${r?.id ?? "new"}`}>{E.type}</label>
        <select id={`ex-type-${r?.id ?? "new"}`} name="expense_type_id" className="input" defaultValue={r?.expense_type_id ?? ""}><option value="">—</option>{(types ?? []).filter((x) => x.active || x.id === r?.expense_type_id).map((x) => <option key={x.id} value={x.id}>{(locale === "ar" && x.name_ar) || x.name_en}</option>)}</select></div>
      <div><label className="label" htmlFor={`ex-loc-${r?.id ?? "new"}`}>{E.place}</label>
        <select id={`ex-loc-${r?.id ?? "new"}`} name="location_id" className="input" defaultValue={r?.location_id ?? ""}><option value="">—</option>{(locs ?? []).map((x) => <option key={x.id} value={x.id}>{(locale === "ar" && x.name_ar) || x.name_en}</option>)}</select></div>
      <div><label className="label" htmlFor={`ex-payee-${r?.id ?? "new"}`}>{E.payee}</label><input id={`ex-payee-${r?.id ?? "new"}`} name="payee" className="input" maxLength={120} defaultValue={r?.payee ?? ""} /></div>
      <div className="sm:col-span-2 lg:col-span-4"><label className="label" htmlFor={`ex-notes-${r?.id ?? "new"}`}>{E.notes}</label><input id={`ex-notes-${r?.id ?? "new"}`} name="notes" className="input" maxLength={1000} defaultValue={r?.notes ?? ""} /></div>
      {r && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={r.active} /> {E.active}</label>}
    </div>
  );

  return (
    <>
      <PageHeader title={E.title} subtitle={E.subtitle} t={t} filename="recurring-expenses" />
      {err && <p className="alert-err mb-4">{err}</p>}
      {sp.ok && <p className="alert-ok mb-4">{t.saved}</p>}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="expense-totals">
        <div className="card"><div className="text-xs text-gray-500">{E.overdueTotal}</div><div className={`text-2xl font-semibold ${overdueTotal ? "text-red-700" : ""}`} dir="ltr">{f(overdueTotal)}</div></div>
        <div className="card"><div className="text-xs text-gray-500">{E.dueMonth}</div><div className="text-2xl font-semibold" dir="ltr">{f(dueMonth)}</div></div>
        <div className="card"><div className="text-xs text-gray-500">{E.paidMonth}</div><div className="text-2xl font-semibold" dir="ltr">{f(paidMonth)}</div></div>
        <div className="card"><div className="text-xs text-gray-500">{E.perMonth}</div><div className="text-2xl font-semibold" dir="ltr">{f(monthly)}</div></div>
      </div>

      <section className="card mb-4 overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{E.due}</h2>
        <p className="px-5 text-xs text-gray-500">{E.dueHint}</p>
        {due.length === 0 ? <p className="px-5 py-4 text-sm text-gray-500">{E.nothingDue}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-testid="expenses-due">
            <thead><tr><th>{E.name}</th><th>{E.dueOn}</th><th>{E.amount}</th><th></th></tr></thead>
            <tbody>
              {due.map((d) => {
                const r = byId.get(d.id)!;
                return (
                  <tr key={`${d.id}-${d.period}`} data-expense={r.name}>
                    <td className="cell-title">{r.name}<div className="text-xs text-gray-400">{lname(r.location_id)} · {E.period} {d.period.slice(0, 7)}</div></td>
                    <td data-label={E.dueOn} dir="ltr">{d.dueOn} {d.overdue ? <span className="badge bg-red-50 text-red-700">{E.overdue}</span> : <span className="badge-gray">{E.upcoming}</span>}</td>
                    <td data-label={E.amount} dir="ltr" className="font-semibold">{f(d.amount)}</td>
                    <td className="no-print">
                      <details><summary className="btn-ghost cursor-pointer list-none py-1.5">{E.pay}</summary>
                        <form action={payRecurringAction} className="mt-2 grid gap-2 sm:grid-cols-5">
                          <input type="hidden" name="recurring_id" value={d.id} /><input type="hidden" name="period" value={d.period} /><input type="hidden" name="client_id" value={crypto.randomUUID()} />
                          <input name="amount" className="input" dir="ltr" inputMode="decimal" defaultValue={f(d.amount)} aria-label={E.amount} />
                          <input name="paid_on" type="date" className="input" defaultValue={today} aria-label={E.paidOn} />
                          <select name="method" className="input" defaultValue={r.method} aria-label={E.method}>{EXPENSE_METHODS.map((x) => <option key={x} value={x}>{E.methods[x]}</option>)}</select>
                          <input name="ref" className="input" dir="ltr" maxLength={60} placeholder={E.ref} aria-label={E.ref} />
                          <PendingButton label={E.payNow} pendingLabel={E.saving} />
                        </form>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </section>

      <details className="card no-print mb-4" open={rows.length === 0}>
        <summary className="cursor-pointer font-semibold" data-testid="new-expense">+ {E.add}</summary>
        <form action={saveRecurringAction} className="mt-4 space-y-3">{fields()}<div className="flex justify-end"><PendingButton label={E.save} pendingLabel={E.saving} /></div></form>
      </details>

      <section className="card mb-4 overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{E.all}</h2>
        {rows.length === 0 ? <p className="px-5 pb-5 text-sm text-gray-500">{E.none}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="expenses-all">
            <thead><tr><th>{E.name}</th><th>{E.amount}</th><th>{E.frequency}</th><th>{E.dueDay}</th><th>{E.type}</th><th>{E.place}</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.active ? "" : "opacity-60"}>
                  <td className="cell-title">{r.name}{!r.active && <span className="badge-gray ms-1">{t.inactive}</span>}{r.payee && <div className="text-xs text-gray-400">{r.payee}</div>}</td>
                  <td data-label={E.amount} dir="ltr" className="font-semibold">{f(Number(r.amount))}</td>
                  <td data-label={E.frequency}>{E.frequencies[r.frequency as Frequency]}</td>
                  <td data-label={E.dueDay} dir="ltr">{r.due_day} <span className="text-xs text-gray-400">{r.start_on}{r.end_on ? ` → ${r.end_on}` : ""}</span></td>
                  <td data-label={E.type}>{tname(r.expense_type_id)}</td>
                  <td data-label={E.place}>{lname(r.location_id)}</td>
                  <td className="no-print"><details><summary className="cursor-pointer text-sm underline">{E.edit}</summary>
                    <form action={saveRecurringAction} className="mt-3 w-[min(90vw,48rem)] space-y-3">{fields(r)}<div className="flex justify-end"><PendingButton label={E.save} pendingLabel={E.saving} /></div></form>
                  </details></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card overflow-hidden p-0 lg:col-span-2">
          <h2 className="card-title px-5 pt-5">{E.history}</h2>
          {(pays ?? []).length === 0 ? <p className="px-5 pb-5 text-sm text-gray-500">{E.noPayments}</p> : (
            <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="expense-payments">
              <thead><tr><th>{E.paidOn}</th><th>{E.name}</th><th>{E.period}</th><th>{E.method}</th><th>{E.amount}</th></tr></thead>
              <tbody>
                {(pays ?? []).slice(0, 200).map((p) => (
                  <tr key={p.id}>
                    <td className="cell-title" dir="ltr">{p.paid_on}</td>
                    <td data-label={E.name}>{byId.get(p.recurring_id ?? "")?.name ?? "—"}{p.ref && <span className="text-xs text-gray-400" dir="ltr"> · {p.ref}</span>}</td>
                    <td data-label={E.period} dir="ltr">{p.period.slice(0, 7)}</td>
                    <td data-label={E.method}>{E.methods[p.method as keyof typeof E.methods] ?? p.method}</td>
                    <td data-label={E.amount} dir="ltr" className="font-semibold">{f(Number(p.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>
        <section className="card overflow-hidden p-0">
          <h2 className="card-title px-5 pt-5">{E.byMonth}</h2>
          {byMonth.size === 0 ? <p className="px-5 pb-5 text-sm text-gray-500">{E.noPayments}</p> : (
            <table className="table table-compact">
              <tbody>{[...byMonth.entries()].sort().map(([m, v]) => <tr key={m}><td className="cell-title" dir="ltr">{m}</td><td dir="ltr" className="font-semibold">{f(v)}</td></tr>)}</tbody>
            </table>
          )}
        </section>
      </div>
      <p className="mt-4 text-xs text-gray-500"><Link href="/pos/expense-types" className="underline">{t.pos.expenses.manageTypes}</Link></p>
    </>
  );
}
