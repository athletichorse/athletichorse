import Link from "next/link";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { ReportFilters } from "@/components/ReportFilters";
import { reportAccess } from "@/lib/report-access";
import { range } from "@/lib/report-range";

export const dynamic = "force-dynamic";
type SP = { from?: string; to?: string; loc?: string; kind?: string; q?: string; method?: string };
const LIMIT = 2000;

/** Every invoice and return in a period, filtered by branch, type, payment method and text; with totals. */
export default async function InvoicesReport({ searchParams }: { searchParams: Promise<SP> }) {
  const { t, locale } = await getDict();
  const P = t.rep;
  const { view, branches, name } = await reportAccess(locale);
  const sp = await searchParams;
  const { from, to, fromIso, toIso } = range(sp);
  const loc = view.find((l) => l.id === sp.loc)?.id;
  const locIds = loc ? [loc] : view.map((l) => l.id);
  const kind = sp.kind === "invoice" || sp.kind === "credit_note" ? sp.kind : null;
  const q = String(sp.q ?? "").trim().slice(0, 60).replace(/[%_,()\\]/g, "");
  const { data: methods } = await db().from("payment_methods").select("code, name_en, name_ar").order("sort");
  const method = methods?.find((m) => m.code === sp.method)?.code ?? null;
  let query = db().from("sales_list").select("id, kind, number, issued_at, location_id, gross_total, vat_total, net_total, customer_name, customer_phone, cashier_name, salesperson_name, methods")
    .gte("issued_at", fromIso).lte("issued_at", toIso).in("location_id", locIds.length ? locIds : ["00000000-0000-0000-0000-000000000000"]).order("issued_at", { ascending: false }).limit(LIMIT);
  if (kind) query = query.eq("kind", kind);
  if (method) query = query.ilike("methods", `%${method}%`);
  if (q) query = query.or(`number.ilike.%${q}%,customer_name.ilike.%${q}%,customer_phone.ilike.%${q}%`);
  const { data: rows } = await query;
  const sign = (k: string) => (k === "credit_note" ? -1 : 1);
  const sum = (f: "gross_total" | "net_total" | "vat_total") => (rows ?? []).reduce((a, r) => a + sign(r.kind) * Number(r[f]), 0);
  const mname = (codes: string | null) => (codes ?? "").split(", ").filter(Boolean).map((c) => { const m = methods?.find((x) => x.code === c); return m ? (locale === "ar" && m.name_ar) || m.name_en : c; }).join(" + ");
  return (
    <>
      <PageHeader title={P.cards.invoices[0]} subtitle={`${from} → ${to}`} t={t} filename={`invoices-${from}-${to}`}>
        <Link href="/sales/reports" className="btn-ghost no-print">← {t.reports.allReports}</Link>
      </PageHeader>
      <ReportFilters t={t} action="/sales/reports/invoices" from={from} to={to} loc={loc} branches={branches}>
        <div><label className="label" htmlFor="iv-kind">{P.kind}</label>
          <select id="iv-kind" name="kind" defaultValue={kind ?? ""} className="input"><option value="">{P.allKinds}</option><option value="invoice">{P.kinds.invoice}</option><option value="credit_note">{P.kinds.credit_note}</option></select></div>
        <div><label className="label" htmlFor="iv-method">{P.method}</label>
          <select id="iv-method" name="method" defaultValue={method ?? ""} className="input"><option value="">—</option>{(methods ?? []).map((m) => <option key={m.code} value={m.code}>{(locale === "ar" && m.name_ar) || m.name_en}</option>)}</select></div>
        <div className="min-w-48 flex-1"><label className="label" htmlFor="iv-q">{P.search}</label><input id="iv-q" name="q" defaultValue={sp.q ?? ""} className="input" /></div>
      </ReportFilters>
      <div className="mb-4 grid gap-3 sm:grid-cols-4" data-testid="invoice-totals">
        <div className="card"><div className="text-xs text-gray-500">{P.count} / {P.returns}</div><div className="text-xl font-semibold">{(rows ?? []).filter((r) => r.kind === "invoice").length} / {(rows ?? []).filter((r) => r.kind === "credit_note").length}</div></div>
        <div className="card"><div className="text-xs text-gray-500">{P.net}</div><div className="text-xl font-semibold" dir="ltr">{sum("net_total").toFixed(2)}</div></div>
        <div className="card"><div className="text-xs text-gray-500">{P.vat}</div><div className="text-xl font-semibold" dir="ltr">{sum("vat_total").toFixed(2)}</div></div>
        <div className="card"><div className="text-xs text-gray-500">{P.gross}</div><div className="text-xl font-semibold" dir="ltr">{sum("gross_total").toFixed(2)}</div></div>
      </div>
      <section className="card overflow-hidden p-0">
        {(rows ?? []).length === 0 ? <p className="p-5 text-sm text-gray-500">{P.none}</p> : (
          <div className="overflow-x-auto"><table className="table table-compact" data-export data-testid="invoices-table">
            <thead><tr><th>{P.invoice}</th><th>{P.branch}</th><th>{P.customer}</th><th>{P.cashier}</th><th>{P.method}</th><th>{P.amount}</th></tr></thead>
            <tbody>
              {(rows ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="cell-title"><Link href={`/sales/${r.id}`} className="font-medium underline" dir="ltr">{r.number}</Link>{r.kind === "credit_note" && <span className="badge bg-red-50 text-red-700 ms-1">{P.kinds.credit_note}</span>}<div className="text-xs text-gray-400">{formatDateTime(new Date(r.issued_at), locale)}</div></td>
                  <td data-label={P.branch}>{name(r.location_id)}</td>
                  <td data-label={P.customer}>{r.customer_name || r.customer_phone || "—"}</td>
                  <td data-label={P.cashier}>{r.cashier_name ?? "—"}{r.salesperson_name && <div className="text-xs text-gray-400">{r.salesperson_name}</div>}</td>
                  <td data-label={P.method}>{mname(r.methods)}</td>
                  <td data-label={P.amount} dir="ltr" className={`font-semibold ${r.kind === "credit_note" ? "text-red-700" : ""}`}>{r.kind === "credit_note" ? "−" : ""}{Number(r.gross_total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {(rows ?? []).length >= LIMIT && <p className="p-3 text-xs text-gray-500">{P.limitNote.replace("{n}", String(LIMIT))}</p>}
      </section>
    </>
  );
}
