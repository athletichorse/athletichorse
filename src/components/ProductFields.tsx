import type { Dict, Locale } from "@/i18n";

export type Group = { id: string; parent_id: string | null; name_en: string; name_ar: string };
export const UNITS = ["piece", "pair", "set", "box", "kg", "m"] as const;
export const UNIT_AR: Record<string, string> = { piece: "قطعة", pair: "زوج", set: "طقم", box: "كرتونة", kg: "كجم", m: "متر" };

/** Shared product fields (names, group, sub-group, unit, service). */
export function ProductFields({ t, locale, groups, value, nameLocked, suppliers = [], factories = [], seeCost = false, expected = null }: {
  t: Dict;
  locale: Locale;
  groups: Group[];
  value?: { name_en: string; name_ar: string; group_id: string | null; subgroup_id: string | null; unit: string; is_service: boolean; supplier_name?: string | null; factory_name?: string | null } & Logistics;
  nameLocked?: boolean;
  suppliers?: string[];
  factories?: string[];
  seeCost?: boolean;
  expected?: number | null;
}) {
  const label = (g: Group) => (locale === "ar" && g.name_ar ? g.name_ar : g.name_en);
  const top = groups.filter((g) => !g.parent_id);
  const subs = groups.filter((g) => g.parent_id);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label">{t.locations.nameEn}</label>
        <input name="name_en" defaultValue={value?.name_en} className="input" dir="ltr" disabled={nameLocked} />
        {nameLocked && <p className="hint">{t.products.fromWebsite}</p>}
      </div>
      <div>
        <label className="label">{t.locations.nameAr}</label>
        <input name="name_ar" defaultValue={value?.name_ar} className="input" dir="rtl" />
      </div>
      <div>
        <label className="label">{t.products.group}</label>
        <select name="group_id" defaultValue={value?.group_id ?? ""} className="input">
          <option value="">{t.products.none}</option>
          {top.map((g) => <option key={g.id} value={g.id}>{label(g)}</option>)}
        </select>
      </div>
      <div>
        <label className="label">{t.products.subgroup}</label>
        <select name="subgroup_id" defaultValue={value?.subgroup_id ?? ""} className="input">
          <option value="">{t.products.none}</option>
          {subs.map((g) => {
            const parent = top.find((p) => p.id === g.parent_id);
            return <option key={g.id} value={g.id}>{parent ? `${label(parent)} › ` : ""}{label(g)}</option>;
          })}
        </select>
      </div>
      <div>
        <label className="label">{t.products.unit}</label>
        <select name="unit" defaultValue={value?.unit ?? "piece"} className="input">
          {UNITS.map((u) => <option key={u} value={u}>{locale === "ar" ? UNIT_AR[u] : u}</option>)}
        </select>
      </div>
      <SupplierFields t={t} suppliers={suppliers} factories={factories} supplier={value?.supplier_name} factory={value?.factory_name} />
      <LogisticsFields t={t} value={value} seeCost={seeCost} expected={expected} />
      <label className="flex items-center gap-2 self-end pb-2.5 text-sm text-gray-700">
        <input type="checkbox" name="is_service" defaultChecked={value?.is_service} className="h-4 w-4 accent-[var(--brand)]" /> {t.products.isService}
      </label>
    </div>
  );
}

export function productError(t: Dict, err?: string) {
  if (!err) return null;
  if (err === "sku") return t.products.badSku;
  if (err === "money") return t.products.badMoney;
  if (err === "sale") return t.products.badSale;
  if (err === "duplicate") return t.products.duplicateCode;
  if (err === "name") return t.products.newForm.nameRequired;
  if (err === "type_needs_group") return t.products.newForm.typeNeedsGroup;
  if (err === "logistics") return t.products.logistics.bad;
  return err;
}

/** Supplier name + factory name: choose one already used, or type a new one. */
export function SupplierFields({ t, suppliers, factories, supplier, factory }: { t: Dict; suppliers: string[]; factories: string[]; supplier?: string | null; factory?: string | null }) {
  const N = t.products.newForm;
  return (
    <>
      <div>
        <label className="label" htmlFor="np-supplier">{N.supplier}</label>
        <input id="np-supplier" name="supplier_name" list="np-suppliers" defaultValue={supplier ?? ""} maxLength={120} autoComplete="off" className="input" />
        <datalist id="np-suppliers">{suppliers.map((x) => <option key={x} value={x} />)}</datalist>
        <p className="hint">{N.listHint}</p>
      </div>
      <div>
        <label className="label" htmlFor="np-factory">{N.factory}</label>
        <input id="np-factory" name="factory_name" list="np-factories" defaultValue={factory ?? ""} maxLength={120} autoComplete="off" className="input" />
        <datalist id="np-factories">{factories.map((x) => <option key={x} value={x} />)}</datalist>
      </div>
    </>
  );
}

export type Logistics = { bin_location?: string | null; units_per_carton?: number | null; carton_cbm?: number | string | null; china_price?: number | string | null; china_currency?: string | null };

/** Where it is stored, pieces per carton, carton size (CBM), and the China price (only for people who may see costs). */
export function LogisticsFields({ t, value, seeCost, expected }: { t: Dict; value?: Logistics; seeCost: boolean; expected?: number | null }) {
  const L = t.products.logistics;
  const n = (v: number | string | null | undefined) => (v === null || v === undefined ? "" : String(Number(v)));
  return (
    <fieldset className="grid gap-4 rounded-lg border border-[var(--line)] p-3 sm:col-span-full sm:grid-cols-2 lg:grid-cols-4">
      <legend className="px-1 text-sm font-semibold">{L.title}</legend>
      <div><label className="label" htmlFor="lg-bin">{L.bin}</label><input id="lg-bin" name="bin_location" className="input" dir="ltr" maxLength={60} defaultValue={value?.bin_location ?? ""} placeholder="A-03-2" /></div>
      <div><label className="label" htmlFor="lg-upc">{L.perCarton}</label><input id="lg-upc" name="units_per_carton" className="input" dir="ltr" inputMode="numeric" defaultValue={n(value?.units_per_carton)} /></div>
      <div><label className="label" htmlFor="lg-cbm">{L.cbm}</label><input id="lg-cbm" name="carton_cbm" className="input" dir="ltr" inputMode="decimal" defaultValue={n(value?.carton_cbm)} placeholder="0.085" /><p className="hint">{L.cbmHint}</p></div>
      {seeCost && (
        <div><label className="label" htmlFor="lg-cp">{L.chinaPrice}</label>
          <div className="flex gap-2">
            <input id="lg-cp" name="china_price" className="input min-w-0 flex-1" dir="ltr" inputMode="decimal" defaultValue={n(value?.china_price)} />
            <select name="china_currency" className="input w-24" defaultValue={value?.china_currency ?? "CNY"} aria-label={L.currency}>{["CNY", "USD", "SAR", "EGP", "EUR"].map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          {value?.china_price !== null && value?.china_price !== undefined && (
            <p className="hint" data-testid="expected-price">{expected !== null && expected !== undefined ? <>{L.expected}: <b dir="ltr">{expected.toFixed(2)} SAR</b> · {L.expectedHint}</> : L.noRate}</p>
          )}</div>
      )}
    </fieldset>
  );
}
