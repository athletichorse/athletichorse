import Link from "next/link";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { ReportFilters } from "@/components/ReportFilters";
import { reportAccess } from "@/lib/report-access";
import { allRows, range, toBuy } from "@/lib/report-range";
import { cartons } from "@/lib/logistics";

export const dynamic = "force-dynamic";
type SP = { from?: string; to?: string; loc?: string; ch?: string; cover?: string; buy?: string; q?: string };

/** Sales analysis & buy plan: pieces sold per item (branches and/or website) in a period, stock now, and how many to buy. */
export default async function AnalysisPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { t, locale } = await getDict();
  const P = t.rep;
  const { view, branches } = await reportAccess(locale);
  const sp = await searchParams;
  const { from, to, fromIso, toIso, days } = range(sp);
  const ch = sp.ch === "branches" || sp.ch === "web" ? sp.ch : "all";
  const cover = Math.min(365, Math.max(1, Number(sp.cover) || 60));
  const loc = view.find((l) => l.id === sp.loc)?.id;
  const locIds = loc ? [loc] : view.map((l) => l.id);
  const q = String(sp.q ?? "").trim().toLowerCase().slice(0, 60);

  const sold = new Map<string, { b: number; w: number }>();
  const add = (v: string | null, k: "b" | "w", n: number) => { if (!v) return; const x = sold.get(v) ?? { b: 0, w: 0 }; x[k] += n; sold.set(v, x); };
  if (ch !== "web" && locIds.length) {
    const invs = await allRows<{ id: string; kind: string }>((a, b) => db().from("invoices").select("id, kind").gte("issued_at", fromIso).lte("issued_at", toIso).in("location_id", locIds).range(a, b));
    const kind = new Map(invs.map((i) => [i.id, i.kind]));
    const ids = invs.map((i) => i.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db().from("invoice_lines").select("invoice_id, variant_id, qty").in("invoice_id", ids.slice(i, i + 200));
      for (const l of data ?? []) add(l.variant_id, "b", (kind.get(l.invoice_id) === "credit_note" ? -1 : 1) * Number(l.qty));
    }
  }
  if (ch !== "branches" && !loc) {
    const orders = await allRows<{ id: string }>((a, b) => db().from("web_orders").select("id").is("cancelled_at", null).gte("created_at", fromIso).lte("created_at", toIso).range(a, b));
    const ids = orders.map((o) => o.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db().from("web_order_lines").select("variant_id, current_qty").in("order_id", ids.slice(i, i + 200));
      for (const l of data ?? []) add(l.variant_id, "w", Number(l.current_qty));
    }
  }
  const vids = [...sold.keys()];
  const info = new Map<string, { name: string; sku: string | null; pid: string }>();
  const pack = new Map<string, { units_per_carton: number | null; carton_cbm: number | null }>();
  const stock = new Map<string, number>();
  for (let i = 0; i < vids.length; i += 300) {
    const part = vids.slice(i, i + 300);
    const [{ data: vs }, { data: st }] = await Promise.all([
      db().from("variant_search").select("variant_id, product_id, sku, name_en, name_ar, option1, option2, option3").in("variant_id", part),
      db().from("stock_levels").select("variant_id, location_id, qty").in("variant_id", part),
    ]);
    for (const v of vs ?? []) info.set(v.variant_id, { pid: v.product_id, sku: v.sku, name: `${(locale === "ar" && v.name_ar) || v.name_en}${[v.option1, v.option2, v.option3].filter(Boolean).length ? " · " + [v.option1, v.option2, v.option3].filter(Boolean).join(" / ") : ""}` });
    for (const s of st ?? []) if (!loc || s.location_id === loc) stock.set(s.variant_id, (stock.get(s.variant_id) ?? 0) + Number(s.qty));
    const pids = [...new Set((vs ?? []).map((v) => v.product_id))];
    const { data: ps } = pids.length ? await db().from("products").select("id, units_per_carton, carton_cbm").in("id", pids) : { data: [] };
    for (const v of vs ?? []) { const p = ps?.find((x) => x.id === v.product_id); if (p) pack.set(v.variant_id, p); }
  }
  let rows = vids.map((v) => {
    const s = sold.get(v)!; const total = s.b + s.w; const st = stock.get(v) ?? 0;
    const tb = toBuy(total, days, st, cover);
    return { v, ...info.get(v), b: s.b, w: s.w, total, stock: st, ...tb, ...cartons(tb.buy, pack.get(v)) };
  }).filter((r) => r.total > 0 && (!q || `${r.name ?? ""} ${r.sku ?? ""}`.toLowerCase().includes(q)));
  if (sp.buy) rows = rows.filter((r) => r.buy > 0);
  rows.sort((a, b) => b.buy - a.buy || b.total - a.total);
  const shown = rows.slice(0, 1000);
  const n = (x: number) => (Math.round(x * 1000) / 1000).toString();
  return (
    <>
      <PageHeader title={P.cards.analysis[0]} subtitle={`${from} → ${to} · ${days} ${P.day}`} t={t} filename={`buy-plan-${from}-${to}`}>
        <Link href="/sales/reports" className="btn-ghost no-print">← {t.reports.allReports}</Link>
      </PageHeader>
      <ReportFilters t={t} action="/sales/reports/analysis" from={from} to={to} loc={loc} branches={branches}>
        <div><label className="label" htmlFor="an-ch">{P.channel}</label>
          <select id="an-ch" name="ch" defaultValue={ch} className="input">{(["all", "branches", "web"] as const).map((c) => <option key={c} value={c}>{P.channels[c]}</option>)}</select></div>
        <div><label className="label" htmlFor="an-cover">{P.cover}</label><input id="an-cover" name="cover" type="number" min={1} max={365} defaultValue={cover} className="input w-24" dir="ltr" /></div>
        <div><label className="label" htmlFor="an-q">{P.item}</label><input id="an-q" name="q" defaultValue={sp.q ?? ""} className="input w-44" /></div>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="buy" value="1" defaultChecked={Boolean(sp.buy)} /> {P.onlyToBuy}</label>
      </ReportFilters>
      <p className="mb-3 text-sm text-gray-500">{P.analysisHint}</p>
      <section className="card overflow-hidden p-0">
        {shown.length === 0 ? <p className="p-5 text-sm text-gray-500">{P.none}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="analysis-table">
            <thead><tr><th>{P.item}</th><th>SKU</th><th>{P.branchQty}</th><th>{P.webQty}</th><th>{P.soldQty}</th><th>{P.perDay}</th><th>{P.stock}</th><th>{P.daysLeft}</th><th>{P.toBuy}</th><th>{t.purchasing.cartonsTotal}</th><th>CBM</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.v}>
                  <td className="cell-title">{r.pid ? <Link href={`/products/${r.pid}`} className="hover:text-[var(--brand)]">{r.name}</Link> : r.name ?? "—"}</td>
                  <td data-label="SKU" dir="ltr" className="font-mono text-xs">{r.sku ?? "—"}</td>
                  <td data-label={P.branchQty} dir="ltr">{n(r.b)}</td>
                  <td data-label={P.webQty} dir="ltr">{n(r.w)}</td>
                  <td data-label={P.soldQty} dir="ltr" className="font-semibold">{n(r.total)}</td>
                  <td data-label={P.perDay} dir="ltr">{r.perDay}</td>
                  <td data-label={P.stock} dir="ltr">{n(r.stock)}</td>
                  <td data-label={P.daysLeft} dir="ltr">{r.daysLeft ?? "—"}</td>
                  <td data-label={P.toBuy} dir="ltr" className={r.buy > 0 ? "font-semibold text-[var(--brand)]" : ""}>{r.buy}</td>
                  <td data-label={t.purchasing.cartonsTotal} dir="ltr">{r.cartons ?? "—"}</td>
                  <td data-label="CBM" dir="ltr">{r.cbm ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {shown.some((r) => r.cbm) && <p className="px-5 py-3 text-sm" data-testid="analysis-cbm">{t.purchasing.cbmTotal}: <b dir="ltr">{Math.round(shown.reduce((a, r) => a + (r.cbm ?? 0), 0) * 1000) / 1000} CBM</b></p>}
        {rows.length > shown.length && <p className="p-3 text-xs text-gray-500">{P.limitNote.replace("{n}", String(shown.length))}</p>}
      </section>
    </>
  );
}
