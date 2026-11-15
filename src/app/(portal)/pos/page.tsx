import { requireStaff } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { needsApproval } from "@/lib/permissions";
import { PageHeader } from "@/components/PageHeader";
import { PosApp } from "@/components/pos/PosApp";
import { redirect } from "next/navigation";
import { BRAND } from "@/lib/product-import";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const me = await requireStaff();
  if (!(["pos.collect", "pos.desk", "pos.quick_sale", "pos.return"] as const).some((k) => me.perms.has(k))) redirect("/forbidden");
  const { t, locale } = await getDict();
  const [{ data: locs }, { data: shift }, { data: methods }, { data: people }, { data: rate }, { data: company }] = await Promise.all([
    db().from("locations").select("id, code, name_en, name_ar").eq("active", true).eq("uses_pos", true).order("code"),
    db().from("pos_shifts").select("id, location_id, opened_at, opening_cash").eq("opened_by", me.id).eq("status", "open").order("opened_at", { ascending: false }).limit(1).maybeSingle(),
    db().from("payment_methods").select("code, name_en, name_ar, kind").eq("active", true).order("sort"),
    db().from("profiles").select("id, full_name").eq("active", true).order("full_name"),
    db().from("settings").select("value").eq("key", "vat_rate").maybeSingle(),
    db().from("company").select("legal_name_en, legal_name_ar").eq("id", 1).maybeSingle(),
  ]);
  const companyName = (locale === "ar" ? company?.legal_name_ar : company?.legal_name_en) || company?.legal_name_en || BRAND[locale];
  const name = (l: { name_en: string; name_ar: string }) => (locale === "ar" ? l.name_ar : l.name_en || l.name_ar);
  const myLocs = (locs ?? []).filter((l) => me.locations === "all" || me.locations.includes(l.id)).map((l) => ({ id: l.id, name: name(l), code: l.code }));
  const { data: quotes } = shift
    ? await db().from("quotations").select("quote_no, gross_total, created_at").eq("location_id", shift.location_id).eq("status", "open").order("created_at", { ascending: false }).limit(30)
    : { data: [] };
  const p = (k: Parameters<typeof me.perms.has>[0]) => me.perms.has(k);
  return (
    <>
      <PageHeader title={t.pos.title} t={t} filename="pos" />
      <PosApp
        t={t}
        locale={locale}
        me={{ id: me.id, name: me.fullName }}
        company={companyName}
        canManageOffline={me.role === "owner" || p("approval.approve")}
        locations={myLocs}
        shift={shift ? { id: shift.id, locationId: shift.location_id, openedAt: shift.opened_at, openingCash: String(shift.opening_cash) } : null}
        methods={(methods ?? []).map((m) => ({ code: m.code, name: locale === "ar" ? m.name_ar : m.name_en, kind: m.kind }))}
        people={(people ?? []).map((x) => ({ id: x.id, name: x.full_name }))}
        vatRate={typeof rate?.value === "string" ? rate.value : "15.00"}
        quotes={(quotes ?? []).map((q) => ({ no: q.quote_no, total: String(q.gross_total), at: q.created_at }))}
        can={{
          shift: p("pos.shift"), sell: p("pos.collect") || p("pos.quick_sale"), desk: p("pos.desk"), collect: p("pos.collect"),
          ret: p("pos.return"), retNoReceipt: p("pos.return_no_receipt"), skipCustomer: p("pos.skip_customer"), discount: p("pos.discount"), priceChange: p("pos.price_change"), cashOut: p("pos.cash_out"),
          addCustomer: p("customers.edit") || p("pos.collect") || p("pos.desk") || p("pos.quick_sale"),
        }}
        approval={{ discount: needsApproval(me.perms, "approval.discount"), ret: needsApproval(me.perms, "approval.return"), cashOut: needsApproval(me.perms, "approval.cash_out") }}
      />
    </>
  );
}
