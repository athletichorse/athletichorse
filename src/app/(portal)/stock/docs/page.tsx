import { TableColumnFilter } from "@/components/TableColumnFilter";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { docNumber } from "@/lib/doc-number";
import { PageHeader } from "@/components/PageHeader";
import { viewableLocations } from "@/components/StockTabs";

export const dynamic = "force-dynamic";
const FILTERS = ["transfer", "receipt", "write_off", "count"] as const;

/**
 * Stock movements (التحويلات المخزنية): every transfer, goods received, issue and count, newest
 * first. Buttons for a new document; quick filters by type and "incoming to me".
 */
export default async function StockDocsPage({ searchParams }: { searchParams: Promise<{ kind?: string; incoming?: string; loc?: string }> }) {
  const me = await requirePermission("stock.view");
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const M = t.stock.moves;
  const { data: locs } = await db().from("locations").select("id, name_en, name_ar").order("code");
  const view = viewableLocations(locs ?? [], me);
  const ids = view.map((l) => l.id);
  const lname = (id: string | null) => { const l = locs?.find((x) => x.id === id); return l ? (locale === "ar" ? l.name_ar : l.name_en || l.name_ar) : "—"; };
  const incoming = sp.incoming === "1";
  const kind = (FILTERS as readonly string[]).includes(sp.kind ?? "") ? sp.kind! : null;

  let q = db().from("stock_doc_list").select("id, doc_no, kind, status, reason, location_id, to_location_id, lines, created_at, created_by_name")
    .order("created_at", { ascending: false }).limit(1000);
  if (incoming) q = q.eq("kind", "transfer");
  else if (kind === "count") q = q.in("kind", ["count", "adjust"]);
  else if (kind) q = q.eq("kind", kind);
  const { data: raw } = ids.length ? await q : { data: [] };
  // incoming to me: transfers to the places I work in (my own branches, not every place I may look at)
  const mine = me.locations === "all" ? ids : ids.filter((id) => (me.locations as string[]).includes(id));
  const pick = sp.loc && ids.includes(sp.loc) ? [sp.loc] : ids;
  const data = (raw ?? [])
    .filter((d) => (incoming ? d.to_location_id && mine.includes(d.to_location_id) : pick.includes(d.location_id) || (d.to_location_id && pick.includes(d.to_location_id))))
    .sort((a, b) => (incoming ? Number(b.status === "in_transit") - Number(a.status === "in_transit") : 0))
    .slice(0, 200);
  const kindName = (k: string) => (t.stock as Record<string, unknown>)[k] as string ?? k;
  // receipts and counts go INTO a place; issues come OUT of one; transfers go from → to
  const fromOf = (d: { kind: string; location_id: string }) => (d.kind === "transfer" || d.kind === "write_off" ? lname(d.location_id) : "—");
  const toOf = (d: { kind: string; location_id: string; to_location_id: string | null }) => (d.kind === "transfer" ? lname(d.to_location_id) : d.kind === "write_off" ? "—" : lname(d.location_id));
  const chip = (href: string, label: string, on: boolean) => (
    <Link href={href} className={`rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap ${on ? "border border-[var(--line)] bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`} aria-current={on ? "true" : undefined}>{label}</Link>
  );
  const p = (k: Parameters<typeof me.perms.has>[0]) => me.perms.has(k);
  const kindBadge = (k: string) => (k === "receipt" ? "badge-green" : k === "write_off" ? "badge bg-red-50 text-red-700" : k === "transfer" ? "badge-gray" : "badge-blue");

  return (
    <>
      <PageHeader title={t.stock.flow.tabs.docs} subtitle={M.subtitle} t={t} filename="stock-movements">
        <div className="no-print flex flex-wrap gap-2" data-testid="moves-actions">
          {p("stock.transfer") && <Link href="/stock/new?kind=transfer" className="btn-primary">{M.newTransfer}</Link>}
          {p("stock.requests") && <Link href="/stock/requests/quick" className="btn-ghost">{M.newRequest}</Link>}
          {p("stock.receive") && <Link href="/stock/new?kind=receipt" className="btn-ghost">{M.newReceipt}</Link>}
          {p("stock.write_off") && <Link href="/stock/new?kind=write_off" className="btn-ghost">{M.newIssue}</Link>}
          {p("stock.count") && <Link href="/stock/count" className="btn-ghost">{M.count}</Link>}
        </div>
      </PageHeader>

      <div className="no-print mb-4 flex flex-wrap items-center gap-1" data-testid="moves-filters">
        {chip("/stock/docs", M.all, !kind && !incoming)}
        {FILTERS.map((k) => chip(`/stock/docs?kind=${k}`, kindName(k), kind === k && !incoming))}
        {chip("/stock/docs?incoming=1", M.incoming, incoming)}
        {!incoming && view.length > 1 && (
          <form action="/stock/docs" className="ms-auto flex gap-2">
            {kind && <input type="hidden" name="kind" value={kind} />}
            <select name="loc" defaultValue={sp.loc ?? ""} aria-label={M.branch} className="input w-auto py-1.5 text-sm">
              <option value="">{M.allBranches}</option>
              {view.map((l) => <option key={l.id} value={l.id}>{lname(l.id)}</option>)}
            </select>
            <button className="btn-ghost py-1.5">{t.stock.flow.show}</button>
          </form>
        )}
      </div>

      <TableColumnFilter t={t}>
      <div className="card overflow-hidden p-0"><div className="overflow-x-auto">
        <table className="table" data-export>
          <thead><tr><th>{M.number}</th><th>{M.date}</th><th>{M.from}</th><th>{M.to}</th><th>{M.items}</th><th>{M.by}</th></tr></thead>
          <tbody>
            {data.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-gray-500">{t.stock.flow.none}</td></tr>}
            {data.map((d) => (
              <tr key={d.id}>
                <td className="cell-title">
                  <Link href={`/stock/docs/${d.id}`} className="font-semibold hover:text-[var(--brand)]" dir="ltr">{docNumber(d.kind, d.doc_no)}</Link>
                  <span className={`${kindBadge(d.kind)} ms-2`}>{kindName(d.kind)}</span>
                  {d.kind === "transfer" && d.status === "in_transit" && <span className="badge ms-2 bg-amber-100 text-amber-800">{M.inTransit}</span>}
                  {d.kind === "transfer" && d.status === "received" && <span className="badge-green ms-2">{t.stock.flow.status.received}</span>}
                  {d.reason && <span className="badge-gray ms-2">{t.stock.flow.reasons[d.reason as keyof typeof t.stock.flow.reasons]}</span>}
                </td>
                <td data-label={M.date} className="text-sm text-gray-600">{formatDateTime(new Date(d.created_at), locale)}</td>
                <td data-label={M.from}>{fromOf(d)}</td>
                <td data-label={M.to}>{toOf(d)}</td>
                <td data-label={M.items}>{d.lines}</td>
                <td data-label={M.by} className="text-sm text-gray-600">{d.created_by_name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
      </TableColumnFilter>
    </>
  );
}
