import { TableColumnFilter } from "@/components/TableColumnFilter";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { docNumber } from "@/lib/doc-number";

const PER_PAGE = 50;
const KINDS = ["receipt", "transfer_out", "transfer_in", "write_off", "count", "adjust", "opening", "sale", "return"] as const;
type Row = { id: number; created_at: string; kind: (typeof KINDS)[number]; qty_change: string; qty_after: string; location_id: string; location_en: string; location_ar: string; product_id: string; name_en: string; name_ar: string; sku: string | null; option1: string | null; option2: string | null; doc_no: number | null; note: string | null; user_name: string | null };

export default async function StockLogPage({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string; page?: string }> }) {
  const me = await requirePermission("stock.log");
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const kind = (KINDS as readonly string[]).includes(sp.kind ?? "") ? sp.kind! : "";
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 60);
  let query = db().from("stock_movement_list").select("*", { count: "exact" });
  if (me.locations !== "all") query = query.in("location_id", me.locations);
  if (kind) query = query.eq("kind", kind);
  if (q) query = query.ilike("search", `%${q.replace(/[%_\\]/g, "")}%`);
  const { data, count } = await query.order("id", { ascending: false }).range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  const rows = (data ?? []) as Row[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PER_PAGE));
  const href = (o: { kind?: string; page?: number }) => {
    const u = new URLSearchParams();
    const m = { kind, page, ...o };
    if (m.kind) u.set("kind", m.kind);
    if (sp.q) u.set("q", sp.q);
    if (m.page && m.page > 1) u.set("page", String(m.page));
    return `/stock-log${u.size ? `?${u}` : ""}`;
  };
  return (
    <>
      <PageHeader title={t.stockLog.title} subtitle={t.stockLog.subtitle} t={t} filename="stock-log" />
      <div className="no-print mb-3 flex flex-wrap gap-2 pb-1">
        <Link href={href({ kind: "", page: 1 })} className={`rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap ${!kind ? "bg-[var(--brand)] text-white" : "border border-[var(--line)] bg-white text-gray-700"}`}>{t.stockLog.allKinds}</Link>
        {KINDS.map((k) => (
          <Link key={k} href={href({ kind: k, page: 1 })} className={`rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap ${kind === k ? "bg-[var(--brand)] text-white" : "border border-[var(--line)] bg-white text-gray-700"}`}>{t.stock.kinds[k]}</Link>
        ))}
      </div>
      <form className="no-print mb-4" action="/stock-log">
        {kind && <input type="hidden" name="kind" value={kind} />}
        <input name="q" defaultValue={sp.q ?? ""} placeholder={t.stock.search} className="input" />
      </form>
      <TableColumnFilter t={t} note={t.pos.colSearch.thisPage}>
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="table" data-export>
            <thead><tr><th>{t.stock.item}</th><th>{t.stockLog.when}</th><th>{t.stock.location}</th><th>{t.stockLog.type}</th><th>{t.stock.change}</th><th>{t.stockLog.after}</th><th>{t.stockLog.doc}</th><th>{t.stockLog.by}</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-gray-500">{t.stock.noStock}</td></tr>}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="cell-title">
                    <Link href={`/products/${r.product_id}`} className="font-medium hover:text-[var(--brand)]">{locale === "ar" && r.name_ar ? r.name_ar : r.name_en}</Link>
                    <div className="text-xs text-gray-500">{[r.option1, r.option2].filter(Boolean).join(" / ")} <span className="font-mono" dir="ltr">{r.sku ?? ""}</span></div>
                  </td>
                  <td data-label={t.stockLog.when} className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(new Date(r.created_at), locale)}</td>
                  <td data-label={t.stock.location}>{locale === "ar" ? r.location_ar : r.location_en || r.location_ar}</td>
                  <td data-label={t.stockLog.type}><span className="badge-gray">{t.stock.kinds[r.kind]}</span></td>
                  <td data-label={t.stock.change} className={`font-semibold ${Number(r.qty_change) < 0 ? "text-red-600" : "text-emerald-700"}`} dir="ltr">{Number(r.qty_change) > 0 ? "+" : ""}{Number(r.qty_change)}</td>
                  <td data-label={t.stockLog.after}>{Number(r.qty_after)}</td>
                  <td data-label={t.stockLog.doc} dir="ltr">{docNumber(r.kind === "transfer_out" || r.kind === "transfer_in" ? "transfer" : r.kind, r.doc_no)}</td>
                  <td data-label={t.stockLog.by} className="text-sm">{r.user_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </TableColumnFilter>
      <div className="no-print mt-4 flex items-center justify-end gap-2 text-sm text-gray-600">
        {page > 1 && <Link href={href({ page: page - 1 })} className="btn-ghost">{t.products.prev}</Link>}
        <span>{page} {t.products.of} {pages}</span>
        {page < pages && <Link href={href({ page: page + 1 })} className="btn-ghost">{t.products.next}</Link>}
      </div>
    </>
  );
}
