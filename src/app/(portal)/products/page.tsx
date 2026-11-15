/* eslint-disable @next/next/no-img-element -- product photos come from the website's CDN, already resized */
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { formatSAR, toHalalas } from "@/lib/money";
import { thumb } from "@/lib/images";
import { PageHeader } from "@/components/PageHeader";
import { syncNowAction } from "@/app/actions/products";

const PER_PAGE = 50;
type SP = { q?: string; f?: string; page?: string; err?: string; synced?: string };
type Row = { id: string; name_en: string; name_ar: string; active: boolean; shopify_product_id: number | null; group_en: string | null; group_ar: string | null; variant_count: number; min_price: string | null; max_price: string | null; missing_sku: number; image_url: string | null };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requirePermission("products.view");
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const canEdit = me.perms.has("products.edit");
  const f = ["missing", "inactive", "portal"].includes(sp.f ?? "") ? sp.f! : "all";
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 80);

  let query = db().from("product_list").select("id, name_en, name_ar, active, shopify_product_id, group_en, group_ar, variant_count, min_price, max_price, missing_sku, image_url", { count: "exact" });
  if (q) query = query.ilike("search", `%${q.replace(/[%_\\]/g, "")}%`);
  if (f === "missing") query = query.gt("missing_sku", 0).eq("active", true);
  else if (f === "inactive") query = query.eq("active", false);
  else if (f === "portal") query = query.is("shopify_product_id", null);
  else query = query.eq("active", true);
  const { data, count } = await query.order("name_en").range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  const rows = (data ?? []) as Row[];

  const [{ data: lastRun }, { data: missingAgg }] = await Promise.all([
    db().from("sync_runs").select("started_at, finished_at, status, counts, error").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    db().from("product_list").select("missing_sku").eq("active", true).gt("missing_sku", 0),
  ]);
  const missingTotal = (missingAgg ?? []).reduce((n, r) => n + Number(r.missing_sku), 0);
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const price = (r: Row) => {
    if (r.min_price === null) return t.products.none;
    const a = formatSAR(toHalalas(r.min_price), locale), b = formatSAR(toHalalas(r.max_price ?? r.min_price), locale);
    return a === b ? a : `${a} – ${b}`;
  };
  const link = (o: Partial<SP>) => {
    const u = new URLSearchParams();
    const m = { q: sp.q, f, page: String(page), ...o };
    if (m.q) u.set("q", m.q);
    if (m.f && m.f !== "all") u.set("f", m.f);
    if (m.page && m.page !== "1") u.set("page", m.page);
    const s = u.toString();
    return `/products${s ? `?${s}` : ""}`;
  };
  const tab = (key: string, label: string) => (
    <Link href={link({ f: key, page: "1" })} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${f === key ? "bg-[var(--brand)] text-white" : "border border-[var(--line)] bg-white text-gray-700 hover:bg-gray-50"}`}>{label}</Link>
  );
  const runBadge = lastRun?.status === "ok" ? "badge-green" : lastRun?.status === "error" ? "badge-gray" : "badge-blue";
  const runLabel = lastRun?.status === "ok" ? t.products.syncOk : lastRun?.status === "error" ? t.products.syncError : t.products.syncRunning;

  return (
    <>
      <PageHeader title={t.products.title} subtitle={t.products.subtitle} t={t} filename="products">
        {canEdit && <Link href="/products/groups" className="btn-ghost no-print">{t.products.groups}</Link>}
        {canEdit && <Link href="/products/new" className="btn-primary no-print">{t.products.newProduct}</Link>}
      </PageHeader>
      {sp.err && <p className="alert-err">{sp.err}</p>}
      {sp.synced && <p className="alert-ok">{t.products.syncDone}</p>}

      <div className="card no-print mb-6 flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-gray-500">{t.products.lastSync}</div>
          <div className="flex flex-wrap items-center gap-2 font-medium text-gray-900">
            {lastRun ? (
              <>
                <span>{formatDateTime(new Date(lastRun.started_at), locale)}</span>
                <span className={runBadge}>{runLabel}</span>
                {lastRun.status === "ok" && (
                  <span className="text-sm font-normal text-gray-500">
                    {Number(lastRun.counts?.website_products ?? 0)} {t.products.title.toLowerCase()} · {Number(lastRun.counts?.variants ?? 0)} {t.products.variants.toLowerCase()}
                  </span>
                )}
              </>
            ) : (
              t.products.never
            )}
          </div>
          {lastRun?.status === "error" && <p className="mt-1 text-sm text-red-600">{lastRun.error}</p>}
          <p className="hint">{t.products.syncDaily}</p>
        </div>
        {canEdit && (
          <form action={syncNowAction}>
            <button className="btn-ghost">{t.products.syncNow}</button>
          </form>
        )}
      </div>

      {missingTotal > 0 && (
        <Link href={link({ f: "missing", page: "1" })} className="no-print mb-6 block rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100">
          <b>{missingTotal}</b> {t.products.skuMissingNote}
        </Link>
      )}

      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <form className="min-w-[200px] flex-1" action="/products">
          {f !== "all" && <input type="hidden" name="f" value={f} />}
          <input name="q" defaultValue={sp.q ?? ""} placeholder={t.products.search} className="input" />
        </form>
        {tab("all", t.products.all)}
        {tab("missing", t.products.missingSku)}
        {tab("portal", t.products.portalOnly)}
        {tab("inactive", t.products.inactiveOnly)}
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="table" data-export>
            <thead>
              <tr><th className="w-14"></th><th>{t.products.name}</th><th>{t.products.group}</th><th>{t.products.variants}</th><th>{t.products.price}</th><th>{t.products.sku}</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-gray-500">{t.products.noResults}</td></tr>
              )}
              {rows.map((r) => {
                const img = thumb(r.image_url, 96);
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td>
                      {img ? <img src={img} alt="" loading="lazy" className="h-10 w-10 rounded-lg border border-[var(--line)] object-cover" /> : <div className="h-10 w-10 rounded-lg bg-gray-100" />}
                    </td>
                    <td>
                      <Link href={`/products/${r.id}`} className="font-medium text-gray-900 hover:text-[var(--brand)]">
                        {locale === "ar" && r.name_ar ? r.name_ar : r.name_en}
                      </Link>
                      {r.name_ar && locale !== "ar" && <div dir="rtl" className="text-start text-xs text-gray-500">{r.name_ar}</div>}
                      <div className="mt-0.5">
                        <span className={r.shopify_product_id ? "badge-blue" : "badge-gray"}>{r.shopify_product_id ? t.products.fromWebsite : t.products.portal}</span>
                      </div>
                    </td>
                    <td className="text-gray-600">{(locale === "ar" ? r.group_ar || r.group_en : r.group_en) ?? t.products.none}</td>
                    <td>{r.variant_count}</td>
                    <td className="whitespace-nowrap">{price(r)}</td>
                    <td>{r.missing_sku > 0 ? <span className="badge bg-amber-50 text-amber-700">{r.missing_sku} {t.products.missingSku.toLowerCase()}</span> : <span className="badge-green">OK</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="no-print mt-4 flex items-center justify-between text-sm text-gray-600">
        <span>{total} {t.products.title.toLowerCase()}</span>
        <div className="flex items-center gap-2">
          {page > 1 && <Link href={link({ page: String(page - 1) })} className="btn-ghost">{t.products.prev}</Link>}
          <span>{page} {t.products.of} {pages}</span>
          {page < pages && <Link href={link({ page: String(page + 1) })} className="btn-ghost">{t.products.next}</Link>}
        </div>
      </div>
    </>
  );
}
