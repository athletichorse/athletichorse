import type { Dict } from "@/i18n";

export type CustomerDetails = { cr_number: string | null; addr_building: string | null; addr_street: string | null; addr_district: string | null; addr_city: string | null; addr_country: string | null; addr_postal: string | null; addr_additional: string | null };
export type CustomerRow = { id: string; customer_no: number; phone: string; name: string; email: string | null; vat_number: string | null; notes: string; active: boolean; credit_limit: string | null; discount_pct: string; details?: CustomerDetails | null };

/** The customer form fields (new customer, or editing one). */
export function CustomerFields({ t, c }: { t: Dict; c?: CustomerRow }) {
  const d = c?.details;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {c && <input type="hidden" name="id" value={c.id} />}
      <div><label className="label">{t.customers.phone} *</label><input name="phone" defaultValue={c?.phone ?? ""} placeholder="05XXXXXXXX" required className="input" dir="ltr" inputMode="tel" /></div>
      <div><label className="label">{t.customers.name}</label><input name="name" defaultValue={c?.name ?? ""} className="input" /></div>
      <div><label className="label">{t.customers.email}</label><input name="email" type="email" defaultValue={c?.email ?? ""} className="input" dir="ltr" /></div>
      <div><label className="label">{t.customers.vat}</label><input name="vat_number" defaultValue={c?.vat_number ?? ""} className="input" dir="ltr" inputMode="numeric" /></div>
      <div><label className="label">{t.pos.extra.creditLimit}</label><input name="credit_limit" defaultValue={c?.credit_limit ?? ""} placeholder={t.pos.extra.noLimit} className="input" dir="ltr" inputMode="decimal" /></div>
      <div><label className="label">{t.pos.extra.usualDiscount} (%)</label><input name="discount_pct" defaultValue={c ? String(Number(c.discount_pct ?? 0)) : "0"} className="input" dir="ltr" inputMode="decimal" /></div>
      <div><label className="label">{t.customers.cr}</label><input name="cr_number" defaultValue={d?.cr_number ?? ""} className="input" dir="ltr" inputMode="numeric" maxLength={10} /></div>
      <fieldset className="grid gap-4 rounded-xl border border-[var(--line)] p-4 sm:col-span-2 sm:grid-cols-2">
        <legend className="px-1 text-sm font-medium text-gray-700">{t.customers.nationalAddress}</legend>
        <div><label className="label">{t.customers.building}</label><input name="addr_building" defaultValue={d?.addr_building ?? ""} className="input" dir="ltr" inputMode="numeric" maxLength={4} /></div>
        <div><label className="label">{t.customers.street}</label><input name="addr_street" defaultValue={d?.addr_street ?? ""} className="input" maxLength={120} /></div>
        <div><label className="label">{t.customers.district}</label><input name="addr_district" defaultValue={d?.addr_district ?? ""} className="input" maxLength={120} /></div>
        <div><label className="label">{t.customers.city}</label><input name="addr_city" defaultValue={d?.addr_city ?? ""} className="input" maxLength={80} /></div>
        <div><label className="label">{t.customers.country}</label><input name="addr_country" defaultValue={d?.addr_country ?? (c ? "" : t.customers.countryDefault)} className="input" maxLength={80} /></div>
        <div><label className="label">{t.customers.postal}</label><input name="addr_postal" defaultValue={d?.addr_postal ?? ""} className="input" dir="ltr" inputMode="numeric" maxLength={5} /></div>
        <div><label className="label">{t.customers.additional}</label><input name="addr_additional" defaultValue={d?.addr_additional ?? ""} className="input" dir="ltr" inputMode="numeric" maxLength={4} /></div>
      </fieldset>
      <div className="sm:col-span-2"><label className="label">{t.customers.notes}</label><input name="notes" defaultValue={c?.notes ?? ""} className="input" /></div>
      {c && <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" name="active" defaultChecked={c.active} className="h-4 w-4 accent-[var(--brand)]" /> {t.active}</label>}
    </div>
  );
}

/** Message for an error code sent back by saveCustomerAction. */
export function customerError(t: Dict, err?: string): string | null {
  if (!err) return null;
  const m: Record<string, string> = {
    phone: t.customers.badPhone, duplicate_phone: t.customers.duplicatePhone, vat: t.company.badVat,
    email: t.customers.badEmail, credit_limit: t.customers.badCreditLimit, discount_pct: t.customers.badDiscount,
    cr: t.customers.badCr, building: t.customers.badBuilding, postal: t.customers.badPostal, additional: t.customers.badAdditional,
  };
  return m[err] ?? err;
}
