import type { Dict } from "@/i18n";

export type CustomerRow = { id: string; customer_no: number; phone: string; name: string; email: string | null; vat_number: string | null; notes: string; active: boolean; credit_limit: string | null; discount_pct: string };

/** The customer form fields (new customer, or editing one). */
export function CustomerFields({ t, c }: { t: Dict; c?: CustomerRow }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {c && <input type="hidden" name="id" value={c.id} />}
      <div><label className="label">{t.customers.phone} *</label><input name="phone" defaultValue={c?.phone ?? ""} placeholder="05XXXXXXXX" required className="input" dir="ltr" inputMode="tel" /></div>
      <div><label className="label">{t.customers.name}</label><input name="name" defaultValue={c?.name ?? ""} className="input" /></div>
      <div><label className="label">{t.customers.email}</label><input name="email" type="email" defaultValue={c?.email ?? ""} className="input" dir="ltr" /></div>
      <div><label className="label">{t.customers.vat}</label><input name="vat_number" defaultValue={c?.vat_number ?? ""} className="input" dir="ltr" inputMode="numeric" /></div>
      <div><label className="label">{t.pos.extra.creditLimit}</label><input name="credit_limit" defaultValue={c?.credit_limit ?? ""} placeholder={t.pos.extra.noLimit} className="input" dir="ltr" inputMode="decimal" /></div>
      <div><label className="label">{t.pos.extra.usualDiscount} (%)</label><input name="discount_pct" defaultValue={c ? String(Number(c.discount_pct ?? 0)) : "0"} className="input" dir="ltr" inputMode="decimal" /></div>
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
  };
  return m[err] ?? err;
}
