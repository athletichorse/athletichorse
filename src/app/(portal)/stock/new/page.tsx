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

export default async function NewStockDoc({ searchParams }: { searchParams: Promise<{ kind?: string; loc?: string; request?: string }> }) {
  const me = await requireStaff();
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const kind = (sp.kind && sp.kind in PERM ? sp.kind : "receipt") as StockKind;
  if (!me.perms.has(PERM[kind])) redirect("/forbidden");
  const { data: locs } = await db().from("locations").select("id, name_en, name_ar").eq("active", true).order("code");
  const name = (l: { name_en: string; name_ar: string }) => (locale === "ar" ? l.name_ar : l.name_en || l.name_ar);
  const all = (locs ?? []).map((l) => ({ id: l.id, name: name(l) }));
  const mine = all.filter((l) => me.locations === "all" || me.locations.includes(l.id));
  // Answering a restock request: its items, to its store, from the suggested sender.
  let initialLines: { variantId: string; name: string; options: string; sku: string | null; qty: string; price: string }[] | undefined;
  let requestTo: string | undefined, requestFrom: string | undefined;
  if (kind === "transfer" && sp.request && /^[0-9a-f-]{36}$/i.test(sp.request)) {
    const { data: rq } = await db().from("stock_requests").select("id, to_location_id, from_location_id, status").eq("id", sp.request).maybeSingle();
    if (rq?.status === "open") {
      requestTo = rq.to_location_id; requestFrom = rq.from_location_id ?? undefined;
      const { data: rl } = await db().from("stock_request_lines").select("variant_id, qty").eq("request_id", rq.id).order("line_no");
      const ids = (rl ?? []).map((l) => l.variant_id);
      const { data: vs } = ids.length ? await db().from("variant_search").select("variant_id, sku, price, option1, option2, option3, name_en, name_ar").in("variant_id", ids) : { data: [] };
      initialLines = (rl ?? []).map((l) => {
        const v = vs?.find((x) => x.variant_id === l.variant_id);
        return { variantId: l.variant_id, qty: String(Number(l.qty)), price: String(v?.price ?? ""), sku: v?.sku ?? null,
          name: String((locale === "ar" && v?.name_ar) || v?.name_en || ""), options: [v?.option1, v?.option2, v?.option3].filter(Boolean).join(" / ") };
      });
    }
  }
  const approval =
    (kind === "receipt" && needsApproval(me.perms, "approval.stock_receive")) ||
    ((kind === "write_off" || kind === "adjust") && needsApproval(me.perms, "approval.write_off"));
  return (
    <>
      <PageHeader title={`${t.stock[kind]}`} t={t}>
        <Link href="/stock" className="btn-ghost no-print">← {t.stock.title}</Link>
      </PageHeader>
      <StockDocForm t={t} locale={locale} kind={kind} locations={mine} destinations={all} defaultLocation={mine.find((l) => l.id === (requestFrom ?? sp.loc))?.id ?? mine[0]?.id ?? ""} approval={approval}
        initialLines={initialLines} requestId={initialLines ? sp.request : undefined} defaultTo={requestTo} />
    </>
  );
}
