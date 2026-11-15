import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { needsApproval } from "@/lib/permissions";
import { PageHeader } from "@/components/PageHeader";
import { StockDocForm } from "@/components/StockDocForm";
import type { StockKind } from "@/app/actions/stock";

const PERM = { receipt: "stock.receive", transfer: "stock.transfer", write_off: "stock.write_off", count: "stock.count", adjust: "stock.count" } as const;

export default async function NewStockDoc({ searchParams }: { searchParams: Promise<{ kind?: string; loc?: string }> }) {
  const me = await requireStaff();
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const kind = (sp.kind && sp.kind in PERM ? sp.kind : "receipt") as StockKind;
  if (!me.perms.has(PERM[kind])) redirect("/forbidden");
  const { data: locs } = await db().from("locations").select("id, name_en, name_ar").eq("active", true).order("code");
  const name = (l: { name_en: string; name_ar: string }) => (locale === "ar" ? l.name_ar : l.name_en || l.name_ar);
  const all = (locs ?? []).map((l) => ({ id: l.id, name: name(l) }));
  const mine = all.filter((l) => me.locations === "all" || me.locations.includes(l.id));
  const approval =
    (kind === "receipt" && needsApproval(me.perms, "approval.stock_receive")) ||
    ((kind === "write_off" || kind === "adjust") && needsApproval(me.perms, "approval.write_off"));
  return (
    <>
      <PageHeader title={`${t.stock[kind]}`} t={t}>
        <Link href="/stock" className="btn-ghost no-print">← {t.stock.title}</Link>
      </PageHeader>
      <StockDocForm t={t} locale={locale} kind={kind} locations={mine} destinations={all} defaultLocation={mine.find((l) => l.id === sp.loc)?.id ?? mine[0]?.id ?? ""} approval={approval} />
    </>
  );
}
