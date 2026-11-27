import "server-only";
import { db } from "@/lib/supabase/admin";

export type BadRow = { location_id: string; variant_id: string; damaged: number; partial: number; onHand: number; name_en: string; name_ar: string; sku: string | null; options: string; product_id: string; image_url: string | null };

/** Every item with damaged or partly faulty pieces (in the given stores, or all), with names and stock on hand. */
export async function badStock(locationIds: string[] | "all"): Promise<BadRow[]> {
  let q = db().from("stock_condition").select("location_id, variant_id, damaged, partial").or("damaged.gt.0,partial.gt.0").limit(5000);
  if (locationIds !== "all") q = q.in("location_id", locationIds.length ? locationIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data } = await q;
  const rows = data ?? [];
  if (!rows.length) return [];
  const vids = [...new Set(rows.map((r) => r.variant_id))];
  const [{ data: vs }, { data: lv }] = await Promise.all([
    db().from("variant_search").select("variant_id, product_id, sku, option1, option2, option3, name_en, name_ar, image_url").in("variant_id", vids),
    db().from("stock_levels").select("location_id, variant_id, qty").in("variant_id", vids),
  ]);
  return rows.map((r) => {
    const v = vs?.find((x) => x.variant_id === r.variant_id);
    const on = lv?.find((x) => x.variant_id === r.variant_id && x.location_id === r.location_id);
    return {
      location_id: r.location_id, variant_id: r.variant_id, damaged: Number(r.damaged), partial: Number(r.partial), onHand: Number(on?.qty ?? 0),
      name_en: String(v?.name_en ?? ""), name_ar: String(v?.name_ar ?? ""), sku: (v?.sku as string) ?? null, product_id: String(v?.product_id ?? ""),
      options: [v?.option1, v?.option2, v?.option3].filter(Boolean).join(" / "), image_url: (v?.image_url as string) ?? null,
    };
  }).sort((a, b) => a.name_en.localeCompare(b.name_en));
}
