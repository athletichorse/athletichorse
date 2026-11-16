import Link from "next/link";
import { notFound } from "next/navigation";
import { canUseLocation, requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { ReceiptView } from "@/components/ReceiptView";
import { CustomerLink } from "@/components/CustomerLink";
import { AutoPrint } from "@/components/AutoPrint";


export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const me = await requirePermission("sales.view");
  const { t, locale } = await getDict();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: inv } = await db().from("invoices").select("*").eq("id", id).maybeSingle();
  if (!inv || (!me.perms.has("sales.view_all_branches") && !canUseLocation(me, inv.location_id))) notFound();
  return (
    <>
      <div className="no-print">
        <PageHeader title={inv.number} t={t} filename={inv.number}>
          <Link href="/sales" className="btn-ghost">← {t.sales.title}</Link>
        </PageHeader>
      </div>
      {sp.print && <AutoPrint mode="receipt80" />}
      <ReceiptView inv={inv} locale={locale} />
      {inv.public_token && <CustomerLink t={t} token={inv.public_token} />}
    </>
  );
}
