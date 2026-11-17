import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { saveCustomerAction } from "@/app/actions/customers";
import { CustomerFields, customerError } from "@/components/CustomerFields";

type C = { id: string; customer_no: number; phone: string; name: string; email: string | null; vat_number: string | null; notes: string; active: boolean; created_at: string; credit_limit: string | null; discount_pct: string; balance: string };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; err?: string; ok?: string; page?: string }> }) {
  const me = await requirePermission("customers.view");
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const canEdit = me.perms.has("customers.edit");
  const q = (sp.q ?? "").trim().replace(/[%_\\,()]/g, "").slice(0, 40);
  const page = Math.max(1, Number(sp.page) || 1);
  let query = db().from("customer_list").select("id, customer_no, phone, name, email, vat_number, notes, active, created_at, credit_limit, discount_pct, balance", { count: "exact" });
  if (q) {
    const digits = q.replace(/\D/g, "");
    if (/^\d+$/.test(q) && q.length <= 7) query = query.eq("customer_no", Number(q));
    else if (digits.length >= 4) query = query.ilike("phone", `%${digits.replace(/^0/, "")}%`);
    else query = query.ilike("name", `%${q}%`);
  }
  const { data, count } = await query.order("customer_no", { ascending: false }).range((page - 1) * 50, page * 50 - 1);
  const rows = (data ?? []) as C[];
  const err = customerError(t, sp.err);
  const { data: lvRows } = await db().from("price_levels").select("id, name_en, name_ar").eq("active", true).order("sort");
  const levels = (lvRows ?? []).map((l) => ({ id: l.id, name: (locale === "ar" && l.name_ar) || l.name_en }));
  const canChange = me.perms.has("customers.update");


  return (
    <>
      <PageHeader title={t.customers.title} subtitle={t.customers.subtitle} t={t} filename="customers" />
      {err && <p className="alert-err">{err}</p>}
      {sp.ok && <p className="alert-ok">{t.saved}</p>}
      <form className="no-print mb-4" action="/customers">
        <input name="q" defaultValue={sp.q ?? ""} placeholder={t.customers.search} className="input" />
      </form>
      <div className="card mb-6 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="table" data-export>
            <thead><tr><th>{t.customers.name}</th><th>{t.customers.no}</th><th>{t.customers.phone}</th><th>{t.customers.email}</th><th>{t.pos.extra.balance}</th><th>{t.pos.extra.creditLimit}</th><th>{t.customers.since}</th><th>{t.home.status}</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-gray-500">{t.customers.none}</td></tr>}
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="cell-title"><Link href={`/customers/${c.id}`} className="font-medium hover:text-[var(--brand)]">{c.name || "—"}</Link>
                    {canChange && <Link href={`/customers/${c.id}#edit`} className="no-print ms-2 text-xs text-[var(--brand)] underline">{t.edit}</Link>}{Number(c.discount_pct) > 0 && <span className="badge-blue ms-2">{Number(c.discount_pct)}%</span>}</td>
                  <td data-label={t.customers.no} className="font-mono">{c.customer_no}</td>
                  <td data-label={t.customers.phone} dir="ltr" className="text-start">{c.phone}</td>
                  <td data-label={t.customers.email} dir="ltr" className="text-start">{c.email ?? "—"}</td>
                  <td data-label={t.pos.extra.balance} dir="ltr" className={Number(c.balance) > 0 ? "font-semibold text-amber-700" : ""}>{Number(c.balance).toFixed(2)}</td>
                  <td data-label={t.pos.extra.creditLimit} dir="ltr">{c.credit_limit === null ? "—" : Number(c.credit_limit).toFixed(2)}</td>
                  <td data-label={t.customers.since} className="text-xs text-gray-500">{formatDateTime(new Date(c.created_at), locale)}</td>
                  <td data-label={t.home.status}>{c.active ? <span className="badge-green">{t.active}</span> : <span className="badge-gray">{t.inactive}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="no-print mb-6 flex items-center justify-end gap-2 text-sm text-gray-600">
        {page > 1 && <Link href={`/customers?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), page: String(page - 1) })}`} className="btn-ghost">{t.products.prev}</Link>}
        <span>{count ?? 0}</span>
        {page * 50 < (count ?? 0) && <Link href={`/customers?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), page: String(page + 1) })}`} className="btn-ghost">{t.products.next}</Link>}
      </div>
      {canEdit && (
        <form action={saveCustomerAction} className="card no-print max-w-3xl">
          <h2 className="card-title">{t.customers.newCustomer}</h2>
          <CustomerFields t={t} levels={levels} />
          <div className="mt-5 flex justify-end"><button className="btn-primary">{t.add}</button></div>
        </form>
      )}
    </>
  );
}
