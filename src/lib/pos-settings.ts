/**
 * Cashier settings (stored one value per key in the `settings` table, see 0009).
 * Pure helpers: defaults and form parsing are tested.
 */
export type PosSettings = {
  receipt_footer_ar: string;
  receipt_footer_en: string;
  receipt_paper_mm: number;
  receipt_width_mm: number;
  block_negative_stock: boolean;
  late_allowed: number;
  late_day_value: number;
  absence_days: number;
  unexcused_absence_days: number;
  overtime_rate: number;
};

export const POS_SETTING_KEYS = [
  "receipt_footer_ar", "receipt_footer_en", "receipt_paper_mm", "receipt_width_mm", "block_negative_stock",
  "late_allowed", "late_day_value", "absence_days", "unexcused_absence_days", "overtime_rate",
] as const satisfies readonly (keyof PosSettings)[];

export const POS_DEFAULTS: PosSettings = {
  receipt_footer_ar: "الاسترجاع خلال 3 أيام مع هذا الإيصال",
  receipt_footer_en: "Returns within 3 days with this receipt",
  receipt_paper_mm: 80,
  receipt_width_mm: 70,
  block_negative_stock: true,
  late_allowed: 3,
  late_day_value: 0.25,
  absence_days: 1,
  unexcused_absence_days: 2,
  overtime_rate: 1,
};

/** Rows from `settings` → typed settings, with defaults for anything missing or unreadable. */
export function readPosSettings(rows: { key: string; value: unknown }[] | null | undefined): PosSettings {
  const out: PosSettings = { ...POS_DEFAULTS };
  for (const r of rows ?? []) {
    const k = r.key as keyof PosSettings;
    if (!(k in POS_DEFAULTS)) continue;
    const d = POS_DEFAULTS[k];
    if (typeof d === "string") (out[k] as string) = typeof r.value === "string" ? r.value : d;
    else if (typeof d === "boolean") (out[k] as boolean) = r.value === true || r.value === "true";
    else { const n = Number(r.value); (out[k] as number) = Number.isFinite(n) ? n : d; }
  }
  return out;
}

const NUM_RULES: Record<string, { min: number; max: number }> = {
  receipt_paper_mm: { min: 40, max: 120 },
  receipt_width_mm: { min: 30, max: 110 },
  late_allowed: { min: 0, max: 31 },
  late_day_value: { min: 0, max: 5 },
  absence_days: { min: 0, max: 10 },
  unexcused_absence_days: { min: 0, max: 10 },
  overtime_rate: { min: 0, max: 5 },
};

/** Form values → settings to save, or the name of the first bad field. */
export function parsePosSettingsForm(get: (k: string) => string | null): { ok: true; values: PosSettings } | { ok: false; field: string } {
  const v: PosSettings = { ...POS_DEFAULTS };
  v.receipt_footer_ar = String(get("receipt_footer_ar") ?? "").trim().slice(0, 500);
  v.receipt_footer_en = String(get("receipt_footer_en") ?? "").trim().slice(0, 500);
  v.block_negative_stock = get("block_negative_stock") === "on" || get("block_negative_stock") === "true";
  for (const [k, r] of Object.entries(NUM_RULES)) {
    const raw = String(get(k) ?? "").trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    const n = Number(raw);
    if (!raw || !Number.isFinite(n) || n < r.min || n > r.max) return { ok: false, field: k };
    (v[k as keyof PosSettings] as number) = n;
  }
  if (v.receipt_width_mm > v.receipt_paper_mm) return { ok: false, field: "receipt_width_mm" };
  return { ok: true, values: v };
}
