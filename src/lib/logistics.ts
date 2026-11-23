/** Cartons, CBM and container fill for purchase orders. */
export const CONTAINERS = [
  { key: "20ft", cbm: 33 },
  { key: "40ft", cbm: 67 },
  { key: "40hq", cbm: 76 },
] as const;

export type Pack = { units_per_carton: number | null; carton_cbm: number | string | null };

/** Cartons needed for a quantity (whole cartons) and their CBM; nulls when the product has no carton details. */
export function cartons(qty: number, p: Pack | undefined) {
  const per = p?.units_per_carton ?? null;
  const cbm = p?.carton_cbm !== null && p?.carton_cbm !== undefined ? Number(p.carton_cbm) : null;
  if (!per || !(qty > 0)) return { cartons: null as number | null, cbm: null as number | null };
  const n = Math.ceil(qty / per);
  return { cartons: n, cbm: cbm ? Math.round(n * cbm * 1000) / 1000 : null };
}

/** How full each container size would be (percent, one decimal). */
export const fill = (cbm: number) => CONTAINERS.map((c) => ({ ...c, pct: Math.round((cbm / c.cbm) * 1000) / 10 }));

/** "12.5" / "١٢٫٥" → number with at most `dec` decimals, or null (empty → null, bad → NaN). */
export function decimal(v: unknown, dec: number): number | null {
  const s = String(v ?? "").trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace("٫", ".").replace(/[,\s]/g, "");
  if (!s) return null;
  return new RegExp(`^\\d{1,9}(\\.\\d{1,${dec}})?$`).test(s) ? Number(s) : NaN;
}
