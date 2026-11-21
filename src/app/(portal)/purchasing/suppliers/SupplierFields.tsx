import type { Dict } from "@/i18n";
import { CURRENCIES } from "@/lib/purchasing";

type S = { name?: string; factory?: string | null; phone?: string | null; email?: string | null; country?: string | null; currency?: string; vat_no?: string | null; cr_no?: string | null; address?: string | null; notes?: string | null };

/** The supplier's details (new supplier and edit use the same fields). */
export function SupplierFields({ t, s }: { t: Dict; s?: S }) {
  const P = t.purchasing;
  const f = (name: keyof S, label: string, opts: { dir?: "ltr"; max?: number; required?: boolean } = {}) => (
    <div><label className="label" htmlFor={`sup-${name}`}>{label}</label>
      <input id={`sup-${name}`} name={name} className="input" dir={opts.dir} maxLength={opts.max ?? 120} required={opts.required} defaultValue={(s?.[name] as string) ?? ""} /></div>
  );
  const currencies = [...new Set([...CURRENCIES, s?.currency ?? "SAR"])];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {f("name", P.supplierName, { required: true })}
      {f("factory", P.factory)}
      <div><label className="label" htmlFor="sup-currency">{P.currency}</label>
        <select id="sup-currency" name="currency" className="input" defaultValue={s?.currency ?? "SAR"}>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
      {f("phone", P.phone, { dir: "ltr", max: 30 })}
      {f("email", P.email, { dir: "ltr" })}
      {f("country", P.country, { max: 60 })}
      {f("vat_no", P.vatNo, { dir: "ltr", max: 30 })}
      {f("cr_no", P.crNo, { dir: "ltr", max: 30 })}
      {f("address", P.address, { max: 300 })}
      <div className="sm:col-span-2 lg:col-span-3"><label className="label" htmlFor="sup-notes">{P.notes}</label><textarea id="sup-notes" name="notes" className="input" rows={2} maxLength={1000} defaultValue={s?.notes ?? ""} /></div>
    </div>
  );
}
