import { ItemFinderButton } from "@/components/ItemFinderButton";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { viewableLocations } from "@/components/StockTabs";

const PER_PAGE = 50;
type Row = { location_id: string; variant_id: string; qty: string; updated_at: string; product_id: string; name_en: string; name_ar: string; sku: string | null; option1: string | null; option2: string | null; option3: string | null };

export default async function StockPage({ searchParams }: { searchParams: Promise<{ loc?: string; q?: string; page?: string }> }) {
  const me = await requirePermission("stock.view");
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const { data: allLocs } = await db().from("locations").select("id, code, name_en, name_ar, kind").eq("active", true).order("code");
  const own = (allLocs ?? []).filter((l) => me.locations === "all" || me.locations.includes(l.id));
  const mine = viewableLocations(allLocs ?? [], me); // look at: own, or all with "stock of all branches"
  const seeAll = me.locations === "all" || me.perms.has("stock.all_locations");
  const loc = mine.find((l) => l.id === sp.loc) ? sp.loc! : seeAll ? "all" : mine[0]?.id ?? "none";
  const { count: incoming } = await db().from("stock_docs").select("id", { count: "exact", head: true }).eq("status", "in_transit")
    .in("to_location_id", own.map((l) => l.id).concat(["00000000-0000-0000-0000-000000000000"]));
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 60);
  const lname = (id: string) => {
    const l = allLocs?.find((x) => x.id === id);
    return l ? (locale === "ar" ? l.name_ar : l.name_en || l.name_ar) : "—";
  };

  let query = db().from("stock_list").select("location_id, variant_id, qty, updated_at, product_id, name_en, name_ar, sku, option1, option2, option3", { count: "exact" }).neq("qty", 0);
  if (loc === "all") {
    if (!seeAll) query = query.in("location_id", mine.map((l) => l.id));
  } else query = query.eq("location_id", loc);
  if (q) query = query.ilike("search", `%${q.replace(/[%_\\]/g, "")}%`);
  const { data, count } = await query.order("name_en").range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  const rows = (data ?? []) as Row[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PER_PAGE));
  const href = (o: { loc?: string; page?: number; q?: string }) => {
    const u = new URLSearchParams();
    const m = { loc, page, q: sp.q ?? "", ...o };
    if (m.loc) u.set("loc", m.loc);
    if (m.q) u.set("q", m.q);
    if (m.page && m.page > 1) u.set("page", String(m.page));
    return `/stock?${u}`;
  };
  const docLoc = own.find((l) => l.id === loc)?.id ?? own[0]?.id ?? "";
  const actions = ([
    ["receipt", "stock.receive"],
    ["transfer", "stock.transfer"],
    ["write_off", "stock.write_off"],
    ["count", "stock.count"],
  ] as const).filter(([, p]) => me.perms.has(p));
  const tab = (id: string, label: string) => (
    <Link key={id} href={href({ loc: id, page: 1 })} className={`rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap ${loc === id ? "bg-[var(--brand)] text-white" : "border border-[var(--line)] bg-white text-gray-700 hover:bg-gray-50"}`}>{label}</Link>
  );

  return (
    <>
      <PageHeader title={t.stock.title} subtitle={t.stock.subtitle} t={t} filename="stock">
        {actions.map(([k], i) => (
          <Link key={k} href={k === "count" ? `/stock/count?loc=${docLoc}` : `/stock/new?kind=${k}&loc=${docLoc}`} className={`${i === 0 ? "btn-primary" : "btn-ghost"} no-print`}>{k === "count" ? t.stock.flow.countSheet : k === "transfer" ? t.stock.flow.send : t.stock[k]}</Link>
        ))}
      </PageHeader>
      {(incoming ?? 0) > 0 && (
        <Link href="/stock/docs?status=in_transit" className="alert-ok no-print block font-medium">🚚 {incoming} {t.stock.flow.incoming} →</Link>
      )}

      <div className="no-print mb-3 flex flex-wrap gap-2 pb-1">
        {seeAll && tab("all", t.stock.allLocations)}
        {mine.map((l) => tab(l.id, locale === "ar" ? l.name_ar : l.name_en || l.name_ar))}
      </div>
      <div className="no-print mb-4 flex flex-wrap gap-2">
        <form className="min-w-0 flex-1" action="/stock">
          <input type="hidden" name="loc" value={loc} />
          <input name="q" defaultValue={sp.q ?? ""} placeholder={t.stock.search} className="input" />
        </form>
        {/* search every item by columns, with its stock at this store */}
        <ItemFinderButton t={t} locale={locale} locationId={loc ?? null} browse />
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="table" data-export>
            <thead><tr><th>{t.stock.item}</th><th>SKU</th>{loc === "all" && <th>{t.stock.location}</th>}<th>{t.stock.onHand}</th><th>{t.stock.lastUpdated}</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-gray-500">{t.stock.noStock}</td></tr>}
              {rows.map((r) => (
                <tr key={`${r.location_id}-${r.variant_id}`}>
                  <td className="cell-title">
                    <Link href={`/products/${r.product_id}`} className="font-medium text-gray-900 hover:text-[var(--brand)]">{locale === "ar" && r.name_ar ? r.name_ar : r.name_en}</Link>
                    {[r.option1, r.option2, r.option3].filter(Boolean).length > 0 && <div className="text-xs text-gray-500">{[r.option1, r.option2, r.option3].filter(Boolean).join(" / ")}</div>}
                  </td>
                  <td data-label="SKU" className="font-mono text-xs" dir="ltr">{r.sku ?? "—"}</td>
                  {loc === "all" && <td data-label={t.stock.location}>{lname(r.location_id)}</td>}
                  <td data-label={t.stock.onHand} className={`font-semibold ${Number(r.qty) < 0 ? "text-red-600" : "text-gray-900"}`}>{Number(r.qty).toLocaleString("en-US")}</td>
                  <td data-label={t.stock.lastUpdated} className="text-xs text-gray-500">{formatDateTime(new Date(r.updated_at), locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="no-print mt-4 flex items-center justify-end gap-2 text-sm text-gray-600">
        {page > 1 && <Link href={href({ page: page - 1 })} className="btn-ghost">{t.products.prev}</Link>}
        <span>{page} {t.products.of} {pages}</span>
        {page < pages && <Link href={href({ page: page + 1 })} className="btn-ghost">{t.products.next}</Link>}
      </div>
    </>
  );
}
