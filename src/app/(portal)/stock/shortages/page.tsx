import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { StockTabs, viewableLocations } from "@/components/StockTabs";
import { RULES, applyRule, type Rule } from "@/lib/stock-rules";

export const dynamic = "force-dynamic";
type SortKey = "name" | "sku" | "qty" | "reorder" | "price";

/** Branch shortages: items whose stock matches a rule (=, ≠, >, ≥, <, ≤) against a number or each item's reorder level. */
export default async function ShortagesPage({ searchParams }: { searchParams: Promise<{ loc?: string; rule?: string; value?: string; reorder?: string; sort?: string; dir?: string; q?: string }> }) {
  const me = await requirePermission("stock.view");
  const { t, locale } = await getDict();
  const F = t.stock.flow;
  const sp = await searchParams;
  const { data: locs } = await db().from("locations").select("id, name_en, name_ar").eq("active", true).order("code");
  const view = viewableLocations(locs ?? [], me);
  const loc = view.find((l) => l.id === sp.loc)?.id ?? view[0]?.id;
  const rule = (RULES as readonly string[]).includes(sp.rule ?? "") ? (sp.rule as Rule) : "<=";
  const useReorder = sp.reorder === "1";
  const value = Number.isFinite(Number(sp.value)) && sp.value !== undefined && sp.value !== "" ? Number(sp.value) : 0;
  const sort = (["name", "sku", "qty", "reorder", "price"] as const).includes(sp.sort as SortKey) ? (sp.sort as SortKey) : "qty";
  const dir = sp.dir === "desc" ? -1 : 1;
  const q = (sp.q ?? "").trim().toLowerCase().replace(/[%_\\]/g, "").slice(0, 60);
  type R = { variant_id: string; product_id: string; sku: string | null; name_en: string; name_ar: string; option1: string | null; option2: string | null; option3: string | null; price: string; qty: string; reorder_level: string | null };
  const rows: R[] = [];
  if (loc) {
    for (let from = 0; from < 50_000; from += 1000) {
      let query = db().from("stock_shortage_list").select("variant_id, product_id, sku, name_en, name_ar, option1, option2, option3, price, qty, reorder_level").eq("location_id", loc).order("variant_id").range(from, from + 999);
      if (q) query = query.ilike("search", `%${q}%`);
      const { data } = await query;
      rows.push(...((data ?? []) as R[]));
      if (!data || data.length < 1000) break;
    }
  }
  const hits = rows.filter((r) => {
    if (useReorder) return r.reorder_level !== null && applyRule(Number(r.qty), rule, Number(r.reorder_level));
    return applyRule(Number(r.qty), rule, value);
  });
  const name = (r: R) => `${(locale === "ar" && r.name_ar) || r.name_en}${[r.option1, r.option2, r.option3].filter(Boolean).length ? ` · ${[r.option1, r.option2, r.option3].filter(Boolean).join(" / ")}` : ""}`;
  const key = (r: R): string | number => sort === "name" ? name(r) : sort === "sku" ? r.sku ?? "" : sort === "qty" ? Number(r.qty) : sort === "reorder" ? Number(r.reorder_level ?? -1) : Number(r.price);
  hits.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
  const base = { loc: loc ?? "", rule, value: String(value), reorder: useReorder ? "1" : "", q: sp.q ?? "" };
  const sortHref = (k: SortKey) => `/stock/shortages?${new URLSearchParams({ ...base, sort: k, dir: sort === k && dir === 1 ? "desc" : "asc" })}`;
  const th = (k: SortKey, label: string) => <th><Link href={sortHref(k)} className="hover:text-gray-900">{label}{sort === k ? (dir === 1 ? " ▲" : " ▼") : ""}</Link></th>;
  return (
    <>
      <PageHeader title={F.tabs.shortages} t={t} filename="shortages" />
      <StockTabs t={t} active="shortages" canRequests={me.perms.has("stock.requests")} />
      <form className="card no-print mb-4 flex flex-wrap items-end gap-3" action="/stock/shortages">
        <div><label className="label">{t.stock.location}</label><select name="loc" defaultValue={loc} className="input w-auto">{view.map((l) => <option key={l.id} value={l.id}>{locale === "ar" ? l.name_ar : l.name_en || l.name_ar}</option>)}</select></div>
        <div><label className="label">{F.rule}</label><select name="rule" defaultValue={rule} className="input w-auto" dir="ltr">{RULES.map((r) => <option key={r} value={r}>{r === "!=" ? "≠" : r === ">=" ? "≥" : r === "<=" ? "≤" : r}</option>)}</select></div>
        <div><label className="label">{F.compareValue}</label><input name="value" defaultValue={String(value)} className="input w-24" dir="ltr" inputMode="decimal" /></div>
        <label className="flex items-center gap-2 pb-2.5 text-sm"><input type="checkbox" name="reorder" value="1" defaultChecked={useReorder} className="h-4 w-4 accent-[var(--brand)]" /> {F.useReorder}</label>
        <div className="min-w-48 flex-1"><label className="label">{F.filter}</label><input name="q" defaultValue={sp.q ?? ""} className="input" /></div>
        <button className="btn-primary">{F.show}</button>
      </form>
      <div className="card overflow-hidden p-0"><div className="overflow-x-auto">
        <table className="table" data-export>
          <thead><tr>{th("name", t.stock.item)}{th("sku", "SKU")}{th("price", F.price)}{th("qty", t.stock.onHand)}{th("reorder", t.products.extras.reorder)}</tr></thead>
          <tbody>
            {hits.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-gray-500">{F.none}</td></tr>}
            {hits.slice(0, 2000).map((r) => (
              <tr key={r.variant_id}>
                <td className="cell-title"><Link href={`/products/${r.product_id}`} className="hover:text-[var(--brand)]">{name(r)}</Link></td>
                <td data-label="SKU" className="font-mono text-xs" dir="ltr">{r.sku ?? "—"}</td>
                <td data-label={F.price} dir="ltr">{Number(r.price).toFixed(2)}</td>
                <td data-label={t.stock.onHand} className={`font-semibold ${Number(r.qty) < 0 ? "text-red-600" : ""}`}>{Number(r.qty)}</td>
                <td data-label={t.products.extras.reorder}>{r.reorder_level === null ? "—" : Number(r.reorder_level)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
      <p className="mt-2 text-xs text-gray-500">{hits.length} / {rows.length}</p>
    </>
  );
}
