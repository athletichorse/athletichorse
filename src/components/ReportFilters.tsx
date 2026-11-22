import type { Dict } from "@/i18n";

/** Date range + branch filter shared by the reports (a plain GET form). */
export function ReportFilters({ t, action, from, to, loc, branches, children }: {
  t: Dict; action: string; from?: string; to?: string; loc?: string; branches?: { id: string; name: string }[]; children?: React.ReactNode;
}) {
  const P = t.rep;
  return (
    <form className="card no-print mb-4 flex flex-wrap items-end gap-3" action={action}>
      {from !== undefined && <div><label className="label" htmlFor="rf-from">{P.from}</label><input id="rf-from" type="date" name="from" defaultValue={from} className="input" dir="ltr" /></div>}
      {to !== undefined && <div><label className="label" htmlFor="rf-to">{P.to}</label><input id="rf-to" type="date" name="to" defaultValue={to} className="input" dir="ltr" /></div>}
      {branches && (
        <div><label className="label" htmlFor="rf-loc">{P.branch}</label>
          <select id="rf-loc" name="loc" defaultValue={loc ?? ""} className="input"><option value="">{P.allBranches}</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      )}
      {children}
      <button className="btn-primary">{P.show}</button>
    </form>
  );
}
