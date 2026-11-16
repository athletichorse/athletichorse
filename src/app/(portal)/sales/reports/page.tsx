import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime, riyadhDate } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { byBranch, byCustomer, byDay, byItem, byMethod, bySalesperson, totals, type RInvoice, type RLine, type RPay } from "@/lib/report-calc";

export const dynamic = "force-dynamic";
const f2 = (n: number) => n.toFixed(2);
type SP = { from?: string; to?: string; loc?: string; q?: string; sku?: string };

async function all<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 200_000; from += 1000) {
    const { data } = await fetchPage(from, from + 999);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** All sales reports on one page: by day, branch, payment method, salesperson, customer; best/least sellers; every item; website; one item's history. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireStaff();
  if (!me.perms.has("reports.view")) redirect("/forbidden?k=reports.view");
  const { t, locale } = await getDict();
  const R = t.reports;
  const sp = await searchParams;
  const today = riyadhDate(new Date());
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : `${today.slice(0, 8)}01`;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : today;
  const fromIso = new Date(`${from}T00:00:00+03:00`).toISOString(), toIso = new Date(`${to}T23:59:59.999+03:00`).toISOString();
  const { data: locs } = await db().from("locations").select("id, name_en, name_ar, uses_pos").order("code");
  const seeAll = me.locations === "all" || me.perms.has("sales.view_all_branches");
  const view = (locs ?? []).filter((l) => seeAll || (me.locations as string[]).includes(l.id));
  const loc = view.find((l) => l.id === sp.loc)?.id;
  const locIds = loc ? [loc] : view.map((l) => l.id);
  const lname = (id: string) => { const l = locs?.find((x) => x.id === id); return l ? (locale === "ar" ? l.name_ar : l.name_en) : "—"; };

  const invs = locIds.length ? await all<RInvoice>((a, b) => db().from("invoices").select("id, kind, issued_at, location_id, salesperson_id, customer_id, gross_total, net_total, vat_total")
    .gte("issued_at", fromIso).lte("issued_at", toIso).in("location_id", locIds).order("issued_at").range(a, b)) : [];
  const ids = invs.map((i) => i.id);
  const lines: RLine[] = [], pays: RPay[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const [{ data: l }, { data: p }] = await Promise.all([
      db().from("invoice_lines").select("invoice_id, variant_id, name, sku, qty, gross, net").in("invoice_id", chunk),
      db().from("invoice_payments").select("invoice_id, method, amount").in("invoice_id", chunk),
    ]);
    lines.push(...((l ?? []) as RLine[])); pays.push(...((p ?? []) as RPay[]));
  }
  const [{ data: people }, { data: methods }] = await Promise.all([db().from("profiles").select("id, full_name"), db().from("payment_methods").select("code, name_en, name_ar")]);
  const custIds = [...new Set(invs.map((i) => i.customer_id).filter(Boolean))] as string[];
  const { data: custs } = custIds.length ? await db().from("customers").select("id, name, phone, customer_no").in("id", custIds.slice(0, 1000)) : { data: [] };
  const who = (id: string) => people?.find((p) => p.id === id)?.full_name ?? "—";
  const mname = (c: string) => { const m = methods?.find((x) => x.code === c); return m ? (locale === "ar" ? m.name_ar : m.name_en) : c; };
  const cname = (id: string) => { const c = custs?.find((x) => x.id === id); return c ? `${c.name || c.phone} · #${c.customer_no}` : "—"; };

  const tot = totals(invs);
  const items = byItem(invs, lines);
  const q = (sp.q ?? "").trim().toLowerCase();
  const itemsShown = q ? items.filter((i) => `${i.name} ${i.sku ?? ""}`.toLowerCase().includes(q)) : items;
  const least = [...items].filter((i) => i.qty > 0).sort((a, b) => a.qty - b.qty || a.gross - b.gross).slice(0, 25);

  // website sales in the same period
  const { data: web } = await db().from("web_orders").select("total, cancelled_at, financial_status").gte("created_at", fromIso).lte("created_at", toIso);
  const webLive = (web ?? []).filter((o) => !o.cancelled_at);
  const webTotal = webLive.reduce((a, o) => a + Number(o.total), 0);

  // one item's history (by SKU)
  let history: { at: string; what: string; qty: number; where: string; ref: string; href?: string }[] = [];
  let histName = "";
  if (sp.sku?.trim()) {
    const { data: v } = await db().from("variant_search").select("variant_id, name_en, name_ar, option1, option2").eq("sku", sp.sku.trim()).maybeSingle();
    if (v) {
      histName = `${(locale === "ar" && v.name_ar) || v.name_en} ${[v.option1, v.option2].filter(Boolean).join(" / ")}`;
      const { data: mv } = await db().from("stock_movement_list").select("*").eq("variant_id", v.variant_id).order("created_at", { ascending: false }).limit(300);
      history = (mv ?? []).filter((m: Record<string, unknown>) => locIds.includes(String(m.location_id))).map((m: Record<string, unknown>) => ({
        at: String(m.created_at), what: (t.stock.kinds as Record<string, string>)[String(m.kind)] ?? String(m.kind), qty: Number(m.qty_change),
        where: lname(String(m.location_id)), ref: m.doc_no ? `#${m.doc_no}` : String(m.ref_type ?? ""),
        href: m.ref_type === "invoice" || m.ref_type === "credit_note" ? `/sales/${m.ref_id}` : undefined,
      }));
    }
  }

  const table = (head: string[], rows: (string | number)[][], key: string) => (
    <div className="overflow-x-auto"><table className="table" data-export={key === "day" ? true : undefined}>
      <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.length === 0 && <tr><td colSpan={head.length} className="text-gray-500">{R.none}</td></tr>}
        {rows.map((r, i) => <tr key={`${key}-${i}`}>{r.map((c, j) => <td key={j} data-label={head[j]} className={j === 0 ? "cell-title" : ""} dir={j > 0 && typeof c === "number" ? "ltr" : undefined}>{c}</td>)}</tr>)}
      </tbody>
    </table></div>
  );
  const card = (title: string, body: React.ReactNode, id: string) => <section id={id} className="card overflow-hidden p-0"><h2 className="card-title px-5 pt-5">{title}</h2>{body}</section>;
  const sum4 = (r: { key: string; count: number; gross: number; net: number; vat: number }, label: string) => [label, r.count, f2(r.net), f2(r.vat), f2(r.gross)];
  const H = [R.count, R.net, R.vat, R.gross];

  return (
    <>
      <PageHeader title={R.title} subtitle={`${from} → ${to}`} t={t} filename={`reports-${from}-${to}`}>
        <Link href="/sales" className="btn-ghost no-print">← {t.sales.title}</Link>
      </PageHeader>
      <form className="card no-print mb-4 flex flex-wrap items-end gap-3" action="/sales/reports">
        <div><label className="label">{R.from}</label><input type="date" name="from" defaultValue={from} className="input" dir="ltr" /></div>
        <div><label className="label">{R.to}</label><input type="date" name="to" defaultValue={to} className="input" dir="ltr" /></div>
        <div><label className="label">{R.branch}</label><select name="loc" defaultValue={loc ?? ""} className="input"><option value="">{R.allBranches}</option>{view.map((l) => <option key={l.id} value={l.id}>{lname(l.id)}</option>)}</select></div>
        <div className="min-w-40 flex-1"><label className="label">{R.itemFilter}</label><input name="q" defaultValue={sp.q ?? ""} className="input" /></div>
        <div><label className="label">{R.itemHistory}</label><input name="sku" defaultValue={sp.sku ?? ""} placeholder="SKU" className="input" dir="ltr" /></div>
        <button className="btn-primary">{R.show}</button>
      </form>
      <nav className="no-print mb-4 flex flex-wrap gap-2 text-sm">
        {[["day", R.byDay], ["branch", R.byBranch], ["method", R.byMethod], ["salesperson", R.bySalesperson], ["customer", R.byCustomer], ["best", R.best], ["least", R.least], ["items", R.items], ["web", R.website], ["history", R.itemHistory]].map(([k, l]) => <a key={k} href={`#${k}`} className="badge-gray">{l}</a>)}
      </nav>
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <div className="card"><div className="text-xs text-gray-500">{R.gross}</div><div className="text-2xl font-semibold" dir="ltr">{f2(tot.gross)}</div></div>
        <div className="card"><div className="text-xs text-gray-500">{R.net}</div><div className="text-2xl font-semibold" dir="ltr">{f2(tot.net)}</div></div>
        <div className="card"><div className="text-xs text-gray-500">{R.vat}</div><div className="text-2xl font-semibold" dir="ltr">{f2(tot.vat)}</div></div>
        <div className="card"><div className="text-xs text-gray-500">{R.count} / {R.returns}</div><div className="text-2xl font-semibold">{tot.invoices} / {tot.returns}</div></div>
      </div>
      <div className="space-y-4">
        {card(R.byDay, table([R.day, ...H], byDay(invs).map((r) => sum4(r, r.key)), "day"), "day")}
        {card(R.byBranch, table([R.branch, ...H], byBranch(invs).map((r) => sum4(r, lname(r.key))), "branch"), "branch")}
        {card(R.byMethod, table([R.method, R.gross], byMethod(invs, pays).map((r) => [mname(r.key), f2(r.amount)]), "method"), "method")}
        {card(R.bySalesperson, table([R.salesperson, ...H], bySalesperson(invs).map((r) => sum4(r, r.key ? who(r.key) : "—")), "sp"), "salesperson")}
        {card(R.byCustomer, table([R.customer, ...H], byCustomer(invs).slice(0, 100).map((r) => sum4(r, cname(r.key))), "cust"), "customer")}
        {card(R.best, table([t.stock.item, "SKU", R.qty, R.gross], items.slice(0, 25).map((i) => [i.name, i.sku ?? "—", i.qty, f2(i.gross)]), "best"), "best")}
        {card(R.least, table([t.stock.item, "SKU", R.qty, R.gross], least.map((i) => [i.name, i.sku ?? "—", i.qty, f2(i.gross)]), "least"), "least")}
        {card(`${R.items} (${itemsShown.length})`, table([t.stock.item, "SKU", R.qty, R.net, R.gross], itemsShown.slice(0, 2000).map((i) => [i.name, i.sku ?? "—", i.qty, f2(i.net), f2(i.gross)]), "items"), "items")}
        {card(R.website, table([R.orders, R.cancelled, R.gross], [[webLive.length, (web ?? []).length - webLive.length, f2(webTotal)]], "web"), "web")}
        {card(`${R.itemHistory}${histName ? ` · ${histName}` : ""}`, sp.sku ? (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>{R.day}</th><th>{R.kind}</th><th>{R.branch}</th><th>{R.qty}</th><th>{R.ref}</th></tr></thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan={5} className="text-gray-500">{R.none}</td></tr>}
              {history.map((h, i) => <tr key={i}><td className="cell-title text-xs">{formatDateTime(new Date(h.at), locale)}</td><td data-label={R.kind}>{h.what}</td><td data-label={R.branch}>{h.where}</td><td data-label={R.qty} dir="ltr" className={h.qty < 0 ? "text-red-600" : "text-emerald-700"}>{h.qty > 0 ? `+${h.qty}` : h.qty}</td><td data-label={R.ref}>{h.href ? <Link href={h.href} className="underline" dir="ltr">{h.ref}</Link> : h.ref}</td></tr>)}
            </tbody>
          </table></div>
        ) : <p className="px-5 pb-5 text-sm text-gray-500">{R.historyHint}</p>, "history")}
      </div>
    </>
  );
}
