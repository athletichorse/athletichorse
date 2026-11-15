import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { saveCompanyAction } from "@/app/actions/company";

export default async function CompanyPage({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  await requirePermission("settings.edit");
  const { t } = await getDict();
  const sp = await searchParams;
  const [{ data: c }, { data: rate }] = await Promise.all([
    db().from("company").select("*").eq("id", 1).maybeSingle(),
    db().from("settings").select("value").eq("key", "vat_rate").maybeSingle(),
  ]);
  const err = sp.err === "vat" ? t.company.badVat : sp.err === "cr" ? t.company.badCr : sp.err;
  const field = ({ name, label, ltr, value }: { name: string; label: string; ltr?: boolean; value?: string | null }) => (
    <div><label className="label">{label}</label><input name={name} defaultValue={value ?? ""} className="input" dir={ltr ? "ltr" : undefined} /></div>
  );
  return (
    <>
      <PageHeader title={t.company.title} t={t} />
      {err && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      {sp.ok && <p className="mb-3 rounded bg-green-50 p-2 text-sm text-green-700">{t.saved}</p>}
      <form action={saveCompanyAction} className="card grid gap-3 md:grid-cols-2">
        {field({ name: "legal_name_ar", label: t.company.legalNameAr, value: c?.legal_name_ar })}
        {field({ name: "legal_name_en", label: t.company.legalNameEn, value: c?.legal_name_en, ltr: true })}
        {field({ name: "vat_number", label: t.company.vatNumber, value: c?.vat_number, ltr: true })}
        {field({ name: "cr_number", label: t.company.crNumber, value: c?.cr_number, ltr: true })}
        {field({ name: "address_ar", label: t.company.addressAr, value: c?.address_ar })}
        {field({ name: "address_en", label: t.company.addressEn, value: c?.address_en, ltr: true })}
        {field({ name: "logo_url", label: t.company.logoUrl, value: c?.logo_url, ltr: true })}
        {field({ name: "vat_rate", label: t.company.vatRate, value: String(rate?.value ?? "15.00"), ltr: true })}
        <button className="btn-primary no-print md:col-span-2">{t.save}</button>
      </form>
    </>
  );
}
