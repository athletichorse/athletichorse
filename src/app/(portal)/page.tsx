import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { riyadhDate } from "@/lib/time";
import { Overview, type OverviewLoc } from "@/components/Overview";
import { dueList, type Recurring } from "@/lib/recurring";

export default async function Home() {
  const s = await requireStaff();
  const { t, locale } = await getDict();
  const seeAll = s.role === "owner" || s.perms.has("sales.view_all_branches");
  const [{ data: locData }, { data: staffData }, { data: webSetting }, products, website, { data: missing }, { data: lastSync }] = await Promise.all([
    db().from("locations").select("id, code, name_ar, name_en, kind, uses_pos, active").order("kind").order("code"),
    seeAll ? db().from("profiles").select("branch_id, active") : Promise.resolve({ data: [] as { branch_id: string | null; active: boolean }[] }),
    db().from("settings").select("value").eq("key", "website_stock_location").maybeSingle(),
    db().from("products").select("id", { count: "exact", head: true }).eq("active", true),
    db().from("products").select("id", { count: "exact", head: true }).eq("active", true).not("shopify_product_id", "is", null),
    db().from("product_list").select("missing_sku").eq("active", true).gt("missing_sku", 0),
    db().from("sync_runs").select("started_at, status, error").eq("source", "shopify").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  // today's pulse: till sales, items below zero, stock per location, latest syncs/uploads
  const visible = seeAll ? (locData ?? []).map((l) => l.id) : s.locations === "all" ? (locData ?? []).map((l) => l.id) : s.locations;
  const dayStart = new Date(`${riyadhDate(new Date())}T00:00:00+03:00`).toISOString();
  const [{ data: todayInv }, { count: belowZero }, { data: runs }, { data: uploads }] = await Promise.all([
    db().from("invoices").select("kind, gross_total, location_id").gte("issued_at", dayStart).in("location_id", visible.length ? visible : ["00000000-0000-0000-0000-000000000000"]),
    db().from("stock_levels").select("variant_id", { count: "exact", head: true }).lt("qty", 0),
    db().from("sync_runs").select("source, status, started_at").order("started_at", { ascending: false }).limit(4),
    db().from("audit_log").select("action, at").in("action", ["products.prices_import", "products.import_file"]).order("at", { ascending: false }).limit(3),
  ]);
  const stockByLoc: Record<string, number> = {};
  for (let from = 0; from < 200_000; from += 1000) {
    const { data } = await db().from("stock_levels").select("location_id, qty").gt("qty", 0).range(from, from + 999);
    for (const r of data ?? []) stockByLoc[r.location_id] = (stockByLoc[r.location_id] ?? 0) + Number(r.qty);
    if (!data || data.length < 1000) break;
  }
  const pulse = {
    todaySales: Math.round((todayInv ?? []).reduce((a, i) => a + (i.kind === "credit_note" ? -1 : 1) * Number(i.gross_total), 0) * 100) / 100,
    todayInvoices: (todayInv ?? []).filter((i) => i.kind === "invoice").length,
    belowZero: belowZero ?? 0,
    stockByLoc,
    latest: [
      ...(runs ?? []).map((r) => ({ label: r.source === "shopify_orders" ? t.home.syncOrders : t.home.syncProducts, at: r.started_at, ok: r.status !== "error" })),
      ...(uploads ?? []).map((u) => ({ label: u.action === "products.prices_import" ? t.home.priceFile : t.home.excelUpload, at: u.at, ok: true })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6),
  };
  const catalog = {
    products: products.count ?? 0,
    website: website.count ?? 0,
    missingSku: (missing ?? []).reduce((n, r) => n + Number(r.missing_sku), 0),
    lastSync: lastSync ?? null,
  };
  // monthly reminder for the owner: download a full backup once a month
  let needBackup = false;
  if (s.perms.has("settings.edit")) {
    const { data: dl } = await db().from("settings").select("value").eq("key", "backup_downloaded_at").maybeSingle();
    const month = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }).slice(0, 7);
    needBackup = typeof dl?.value !== "string" || month(new Date(dl.value)) !== month(new Date());
  }
  // recurring expenses past their due day and not paid yet
  let overdue = { n: 0, total: 0 };
  if (s.perms.has("purchasing.expenses")) {
    const [{ data: rex }, { data: rpaid }] = await Promise.all([
      db().from("recurring_expenses").select("id, frequency, due_day, start_on, end_on, active, amount").eq("active", true),
      db().from("expense_payments").select("recurring_id, period").not("recurring_id", "is", null),
    ]);
    const late = dueList((rex ?? []) as Recurring[], new Set((rpaid ?? []).map((p) => `${p.recurring_id}|${p.period}`)), riyadhDate(new Date()), 0).filter((d) => d.overdue);
    overdue = { n: late.length, total: late.reduce((a, d) => a + d.amount, 0) };
  }
  return (
    <>
    {overdue.n > 0 && (
      <p className="alert-err no-print mb-4 flex flex-wrap items-center gap-3" data-testid="expenses-reminder">
        <span className="flex-1">{t.expenses.reminder} {overdue.n} · <span dir="ltr">{overdue.total.toFixed(2)}</span></span>
        <Link href="/purchasing/expenses" className="font-semibold underline">{t.expenses.open}</Link>
      </p>
    )}
    {needBackup && (
      <p className="alert-err no-print mb-4 flex flex-wrap items-center gap-3" data-testid="backup-reminder">
        <span className="flex-1">{t.company.backup.reminder}</span>
        <Link href="/company/backup" className="font-semibold underline">{t.company.backup.open}</Link>
      </p>
    )}
    <Overview
      s={s}
      t={t}
      locale={locale}
      now={new Date()}
      locs={(locData ?? []) as OverviewLoc[]}
      staff={staffData ?? []}
      webLocId={typeof webSetting?.value === "string" ? webSetting.value : null}
      catalog={catalog}
      pulse={pulse}
    />
    </>
  );
}
