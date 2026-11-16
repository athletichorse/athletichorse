import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { StockTabs, viewableLocations } from "@/components/StockTabs";

export const dynamic = "force-dynamic";
const KINDS = ["receipt", "transfer", "write_off", "count", "adjust"] as const;

/** Stock documents: receipts, transfers (in transit / received), write-offs, counts. */
export default async function StockDocsPage({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string; loc?: string }> }) {
  const me = await requirePermission("stock.view");
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const { data: locs } = await db().from("locations").select("id, name_en, name_ar").order("code");
  const view = viewableLocations(locs ?? [], me);
  const ids = view.map((l) => l.id);
  const lname = (id: string | null) => { const l = locs?.find((x) => x.id === id); return l ? (locale === "ar" ? l.name_ar : l.name_en || l.name_ar) : "—"; };
  let q = db().from("stock_doc_list").select("id, doc_no, kind, status, reason, location_id, to_location_id, lines, created_at, created_by_name, value, total_qty")
    .order("created_at", { ascending: false }).limit(1000);
  if (sp.kind && (KINDS as readonly string[]).includes(sp.kind)) q = q.eq("kind", sp.kind);
  if (sp.status === "in_transit" || sp.status === "received" || sp.status === "done") q = q.eq("status", sp.status);
  const { data: raw } = ids.length ? await q : { data: [] };
  // a document shows when its sender or receiver is a location this person may look at (or the chosen one)
  const pick = sp.loc && ids.includes(sp.loc) ? [sp.loc] : ids;
  const data = (raw ?? []).filter((d) => pick.includes(d.location_id) || (d.to_location_id && pick.includes(d.to_location_id))).slice(0, 200);
  const F = t.stock.flow;
  const kindName = (k: string) => (k === "transfer" ? t.stock.transfer : (t.stock as Record<string, unknown>)[k] as string ?? k);
  return (
    <>
      <PageHeader title={F.tabs.docs} t={t} filename="stock-documents" />
      <StockTabs t={t} active="docs" canRequests={me.perms.has("stock.requests")} />
      <form className="no-print mb-4 flex flex-wrap gap-2" action="/stock/docs">
        <select name="kind" defaultValue={sp.kind ?? ""} className="input w-auto"><option value="">{F.allKinds}</option>{KINDS.map((k) => <option key={k} value={k}>{kindName(k)}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""} className="input w-auto"><option value="">—</option>{(["in_transit", "received", "done"] as const).map((s) => <option key={s} value={s}>{F.status[s]}</option>)}</select>
        <select name="loc" defaultValue={sp.loc ?? ""} className="input w-auto"><option value="">{t.stock.allLocations}</option>{view.map((l) => <option key={l.id} value={l.id}>{lname(l.id)}</option>)}</select>
        <button className="btn-ghost">{F.show}</button>
      </form>
      <div className="card overflow-hidden p-0"><div className="overflow-x-auto">
        <table className="table" data-export>
          <thead><tr><th>{F.docNo}</th><th>{F.kind}</th><th>{F.from}</th><th>{t.stock.to}</th><th>{t.stock.lines}</th><th>{F.value}</th><th>{F.date}</th><th>{F.by}</th><th></th></tr></thead>
          <tbody>
            {(data ?? []).length === 0 && <tr><td colSpan={9} className="py-10 text-center text-gray-500">{F.none}</td></tr>}
            {(data ?? []).map((d) => (
              <tr key={d.id}>
                <td className="cell-title" dir="ltr"><Link href={`/stock/docs/${d.id}`} className="font-medium hover:text-[var(--brand)]">#{d.doc_no}</Link></td>
                <td data-label={F.kind}>{kindName(d.kind)}{d.kind === "transfer" && <span className={`ms-2 ${d.status === "in_transit" ? "badge bg-amber-100 text-amber-800" : "badge-green"}`}>{F.status[d.status as keyof typeof F.status]}</span>}{d.reason && <span className="badge-gray ms-2">{F.reasons[d.reason as keyof typeof F.reasons]}</span>}</td>
                <td data-label={F.from}>{lname(d.location_id)}</td>
                <td data-label={t.stock.to}>{d.to_location_id ? lname(d.to_location_id) : "—"}</td>
                <td data-label={t.stock.lines}>{d.lines} · {Number(d.total_qty)}</td>
                <td data-label={F.value} dir="ltr">{Number(d.value).toFixed(2)}</td>
                <td data-label={F.date} className="text-xs text-gray-500">{formatDateTime(new Date(d.created_at), locale)}</td>
                <td data-label={F.by}>{d.created_by_name ?? "—"}</td>
                <td><Link href={`/stock/docs/${d.id}`} className="btn-ghost no-print py-1.5">{F.open}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </>
  );
}
