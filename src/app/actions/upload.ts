"use server";

import { assertPermission } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { BRAND, convertPrice, isCode, scrubBrand, type ImportRow, type Rate } from "@/lib/product-import";

export type ChunkResult = { ok: true; counts: Record<string, number> } | { ok: false; error: string };

const RATE_RE = /^\d{1,6}(\.\d{1,2})?$/;
/** Private list (Vercel env BRAND_REPLACE, comma-separated) of brand names to replace with ours. */
const OTHER_BRANDS = (process.env.BRAND_REPLACE ?? "").split(",");
const s = (v: unknown, max: number) => scrubBrand(String(v ?? "").trim(), OTHER_BRANDS).slice(0, max);

/** Imports up to 500 rows. Re-validates everything; prices are converted here, not in the browser. */
export async function importProductsChunk(rows: ImportRow[], rate: Rate): Promise<ChunkResult> {
  const staff = await assertPermission("upload.import");
  if (!staff.perms.has("products.edit")) return { ok: false, error: "Missing permission: products.edit" };
  if (!Array.isArray(rows) || rows.length > 500) return { ok: false, error: "Send at most 500 rows at a time" };
  if (!RATE_RE.test(String(rate?.from)) || !RATE_RE.test(String(rate?.to)) || Number(rate.from) <= 0) return { ok: false, error: "Bad exchange rate" };

  let clean;
  try {
    clean = rows.map((r) => {
      const sku = r.sku && isCode(String(r.sku)) ? String(r.sku) : null;
      return {
        ref: s(r.ref, 60),
        sku,
        name_ar: s(r.name_ar, 300),
        name_en: s(r.name_en, 300),
        group_ar: s(r.group_ar, 80),
        group_en: s(r.group_en, 80),
        unit: ["piece", "pair", "set", "box", "kg", "m"].includes(String(r.unit)) ? r.unit : "",
        codes: (Array.isArray(r.codes) ? r.codes : []).map(String).filter((c) => isCode(c)).slice(0, 20),
        price: convertPrice(r.price_src === null ? null : String(r.price_src), { from: String(rate.from), to: String(rate.to), whole: Boolean(rate.whole) }),
        active: r.active !== false,
        service: r.service === true,
        model: s(r.model, 60),
        option1: s(r.option1, 60),
        option2: s(r.option2, 60),
        images: (Array.isArray(r.images) ? r.images : []).map(String).filter((u) => /^https:\/\/[^\s"'<>]+$/.test(u)).slice(0, 10),
      };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bad data" };
  }
  if (clean.some((r) => !r.ref || (!r.name_ar && !r.name_en))) return { ok: false, error: "Every row needs an SKU and a name" };

  const { data, error } = await db().rpc("import_products", { p_rows: clean, p_vendor: BRAND.en });
  if (error) return { ok: false, error: error.message };
  return { ok: true, counts: data as Record<string, number> };
}
