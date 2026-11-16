import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { saveCompanyAction } from "@/app/actions/company";
import { saveWebsiteAction, websiteNowAction } from "@/app/actions/website";
import { ordersConfig } from "@/lib/shopify-orders";
import { POS_SETTING_KEYS, readPosSettings } from "@/lib/pos-settings";

const WEB_KEYS = ["shopify_push_prices", "shopify_push_stock", "web_orders_to_quotes", "shopify_location_id", "shopify_push_last_prices", "shopify_push_last_stock", "shopify_push_last_webhooks"];

export default async function CompanyPage({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string; done?: string; n?: string }> }) {
  await requirePermission("settings.edit");
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const [{ data: c }, { data: settings }, { data: locs }] = await Promise.all([
    db().from("company").select("*").eq("id", 1).maybeSingle(),
    db().from("settings").select("key, value").in("key", ["vat_rate", "website_stock_location", ...POS_SETTING_KEYS, ...WEB_KEYS]),
    db().from("locations").select("id, name_ar, name_en, kind").eq("active", true).order("kind").order("code"),
  ]);
  const get = (k: string) => settings?.find((x) => x.key === k)?.value;
  const ps = readPosSettings(settings);
  const posLabels = t.company.pos as Record<string, string>;
  const w = t.company.web;
  const on = (k: string) => get(k) === true || get(k) === "true";
  const connected = ordersConfig() !== null;
  const last = (k: string) => {
    const v = get(`shopify_push_last_${k}`) as { at?: string; ok?: boolean; error?: string | null; sent?: number } | undefined;
    if (!v?.at) return null;
    const when = new Date(v.at).toLocaleString(locale === "ar" ? "ar-SA" : "en-GB", { timeZone: "Asia/Riyadh", dateStyle: "short", timeStyle: "short" });
    return <p className={`hint ${v.ok ? "" : "text-red-600"}`}>{w.last}: {when} · {v.ok ? `${w.ok}${v.sent !== undefined ? ` (${v.sent})` : ""}` : `${w.failed}: ${v.error ?? ""}`}</p>;
  };
  const err = sp.err === "vat" ? t.company.badVat : sp.err === "cr" ? t.company.badCr
    : sp.err === "switch_off" ? w.switchOff : sp.err === "webhooks_local" ? w.webhooksLocal : sp.err === "location" ? w.badLocation
    : sp.err?.startsWith("pos:") ? `${t.company.pos.bad}: ${posLabels[sp.err.slice(4)] ?? sp.err.slice(4)}` : sp.err;
  const num = (name: keyof typeof ps & string, step = "1") => (
    <div>
      <label className="label" htmlFor={name}>{posLabels[name]}</label>
      <input id={name} name={name} type="number" step={step} defaultValue={String(ps[name])} className="input" dir="ltr" />
    </div>
  );

  const field = ({ name, label, ltr, value, hint }: { name: string; label: string; ltr?: boolean; value?: string | null; hint?: string }) => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} defaultValue={value ?? ""} className="input" dir={ltr ? "ltr" : undefined} />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );

  return (
    <>
      <PageHeader title={t.company.title} t={t} />
      {err && <p className="alert-err">{err}</p>}
      {sp.ok && <p className="alert-ok">{t.saved}</p>}
      {sp.done && <p className="alert-ok">{w.done}{sp.n ? ` (${sp.n})` : ""}</p>}
      <form action={saveCompanyAction} className="space-y-6">
        <section className="card">
          <h2 className="card-title">{t.company.sectionLegal}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {field({ name: "legal_name_en", label: t.company.legalNameEn, value: c?.legal_name_en, ltr: true })}
            {field({ name: "legal_name_ar", label: t.company.legalNameAr, value: c?.legal_name_ar })}
            {field({ name: "cr_number", label: t.company.crNumber, value: c?.cr_number, ltr: true, hint: t.company.crHint })}
            {field({ name: "logo_url", label: t.company.logoUrl, value: c?.logo_url, ltr: true })}
            {field({ name: "address_en", label: t.company.addressEn, value: c?.address_en, ltr: true })}
            {field({ name: "address_ar", label: t.company.addressAr, value: c?.address_ar })}
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">{t.company.sectionTax}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {field({ name: "vat_number", label: t.company.vatNumber, value: c?.vat_number, ltr: true, hint: t.company.vatHint })}
            {field({ name: "vat_rate", label: t.company.vatRate, value: String(get("vat_rate") ?? "15.00"), ltr: true })}
          </div>
        </section>

        <section className="card" id="online">
          <h2 className="card-title">{t.company.sectionOnline}</h2>
          <div className="max-w-md">
            <label className="label" htmlFor="website_stock_location">{t.company.websiteStock}</label>
            <select id="website_stock_location" name="website_stock_location" className="input" defaultValue={typeof get("website_stock_location") === "string" ? (get("website_stock_location") as string) : ""}>
              <option value="">—</option>
              {locs?.map((l) => (
                <option key={l.id} value={l.id}>{locale === "ar" ? l.name_ar : l.name_en || l.name_ar}</option>
              ))}
            </select>
            <p className="hint">{t.company.websiteStockHint}</p>
          </div>
        </section>

        <section className="card" id="cashier">
          <h2 className="card-title">{t.company.pos.title}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label" htmlFor="receipt_footer_en">{t.company.pos.receipt_footer_en}</label>
              <textarea id="receipt_footer_en" name="receipt_footer_en" defaultValue={ps.receipt_footer_en} rows={2} className="input" dir="ltr" />
            </div>
            <div className="md:col-span-2">
              <label className="label" htmlFor="receipt_footer_ar">{t.company.pos.receipt_footer_ar}</label>
              <textarea id="receipt_footer_ar" name="receipt_footer_ar" defaultValue={ps.receipt_footer_ar} rows={2} className="input" dir="rtl" />
            </div>
            {num("receipt_paper_mm")}
            {num("receipt_width_mm")}
            <label className="flex items-start gap-2 text-sm md:col-span-2">
              <input type="checkbox" name="block_negative_stock" defaultChecked={ps.block_negative_stock} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
              <span><span className="font-medium">{t.company.pos.block_negative_stock}</span><span className="hint block">{t.company.pos.blockHint}</span></span>
            </label>
          </div>
          <h3 className="mt-6 mb-3 text-sm font-semibold text-gray-700">{t.company.pos.attendance}</h3>
          <div className="grid gap-4 md:grid-cols-3">
            {num("late_allowed")}
            {num("late_day_value", "0.05")}
            {num("absence_days", "0.5")}
            {num("unexcused_absence_days", "0.5")}
            {num("overtime_rate", "0.05")}
          </div>
        </section>

        <div className="no-print flex justify-end">
          <button className="btn-primary">{t.save}</button>
        </div>
      </form>
      <section className="card mt-6" id="website">
        <h2 className="card-title">{w.title}</h2>
        <p className="hint mb-4">{connected ? w.intro : w.notConnected}</p>
        <form action={saveWebsiteAction} className="space-y-4">
          {(["push_prices", "push_stock", "orders_to_quotes"] as const).map((k) => {
            const key = k === "orders_to_quotes" ? "web_orders_to_quotes" : `shopify_${k}`;
            return (
              <label key={k} className="flex items-start gap-2 text-sm">
                <input type="checkbox" name={key} defaultChecked={on(key)} disabled={!connected} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
                <span><span className="font-medium">{w[k]}</span><span className="hint block">{w[`${k}Hint`]}</span></span>
              </label>
            );
          })}
          <div className="max-w-md">
            <label className="label" htmlFor="shopify_location_id">{w.location}</label>
            <input id="shopify_location_id" name="shopify_location_id" defaultValue={typeof get("shopify_location_id") === "string" ? (get("shopify_location_id") as string) : ""} className="input" dir="ltr" disabled={!connected} />
            <p className="hint">{w.locationHint}</p>
          </div>
          <div className="flex justify-end"><button className="btn-primary" disabled={!connected}>{t.save}</button></div>
        </form>
        {connected && (
          <div className="mt-6 grid gap-4 border-t pt-4 md:grid-cols-2">
            {([["prices", w.sendPrices, "prices"], ["stock", w.sendStock, "stock"], ["quotes", w.makeQuotes, null], ["webhooks", w.webhooks, "webhooks"]] as const).map(([what, label, lastKey]) => (
              <form key={what} action={websiteNowAction}>
                <input type="hidden" name="what" value={what} />
                <button className="btn-ghost">{label}</button>
                {what === "webhooks" && <p className="hint">{w.webhooksHint}</p>}
                {lastKey && last(lastKey)}
              </form>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
