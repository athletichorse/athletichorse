import type { Dict, Locale } from "@/i18n";

export type Group = { id: string; parent_id: string | null; name_en: string; name_ar: string };
export const UNITS = ["piece", "pair", "set", "box", "kg", "m"] as const;
export const UNIT_AR: Record<string, string> = { piece: "قطعة", pair: "زوج", set: "طقم", box: "كرتونة", kg: "كجم", m: "متر" };

/** Shared product fields (names, group, sub-group, unit, service). */
export function ProductFields({ t, locale, groups, value, nameLocked }: {
  t: Dict;
  locale: Locale;
  groups: Group[];
  value?: { name_en: string; name_ar: string; group_id: string | null; subgroup_id: string | null; unit: string; is_service: boolean };
  nameLocked?: boolean;
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
  return err;
}
