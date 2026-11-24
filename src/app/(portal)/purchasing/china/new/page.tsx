import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { ChinaOrderForm } from "@/components/ChinaOrderForm";
import { readRates } from "@/lib/fx";

export const dynamic = "force-dynamic";

/** New China order (the CNY rate starts from Purchases → Exchange rates). */
export default async function NewChinaOrder() {
  await requirePermission("purchasing.view");
  const me = await requirePermission("purchasing.edit");
  const { t, locale } = await getDict();
  const [{ data: sups }, { data: locs }, { data: fx }] = await Promise.all([
    db().from("suppliers").select("id, name").eq("active", true).order("name"),
    db().from("locations").select("id, name_en, name_ar").eq("active", true).order("code"),
    db().from("settings").select("value").eq("key", "fx_rates").maybeSingle(),
  ]);
  const locations = (locs ?? []).filter((l) => me.locations === "all" || me.locations.includes(l.id)).map((l) => ({ id: l.id, name: (locale === "ar" && l.name_ar) || l.name_en }));
  const cny = readRates(fx?.value).CNY;
  return (
    <>
      <PageHeader title={t.cn.newOrder} t={t}><Link href="/purchasing/china" className="btn-ghost no-print">← {t.cn.title}</Link></PageHeader>
      <ChinaOrderForm t={t} locale={locale} suppliers={sups ?? []} locations={locations} editable
        initial={{ id: "", poId: "", status: "draft", supplierId: "", locationId: locations[0]?.id ?? "", title: "", container: "40ft", rate: cny ? String(cny) : "", ratePaid: "", feeShipping: "", feeCustoms: "", feeOther: "", notes: "", lines: [] }} />
    </>
  );
}
