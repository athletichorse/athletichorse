import writeXlsxFile, { type SheetData } from "write-excel-file/node";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { UNIT_AR } from "@/components/ProductFields";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The prices & stock form, ready to fill in and upload back on the Upload page:
 *   ?with=items → every item with its barcode, name, unit, group, prices, price levels and
 *                 quantity per store (change what you need; unchanged cells change nothing)
 *   otherwise   → the column names only
 * Column names are exactly the ones the prices file reads.
 */
export async function GET(req: Request) {
  const me = await requireStaff();
  if (!me.perms.has("products.edit")) return new Response("forbidden", { status: 403 });
  const withItems = new URL(req.url).searchParams.get("with") === "items";
  const seeCost = me.perms.has("products.view_cost");

  const [{ data: levels }, { data: locs }] = await Promise.all([
    db().from("price_levels").select("id, name_en, name_ar").eq("active", true).neq("code", "wholesale").order("sort"),
    me.perms.has("stock.count") ? db().from("locations").select("id, code, name_en, name_ar").eq("active", true).order("code") : Promise.resolve({ data: [] as { id: string; code: string; name_en: string; name_ar: string }[] }),
  ]);
  const stores = (locs ?? []).filter((l) => me.locations === "all" || me.locations.includes(l.id));
  const levelName = (l: { name_en: string; name_ar: string }) => l.name_ar || l.name_en;
  const storeName = (l: { name_en: string; name_ar: string; code: string }) => l.name_ar || l.name_en || l.code;

  const head = ["الباركود", "الصنف", "الاسم بالإنجليزي", "اللون / المقاس", "الوحدة", "المجموعة", "اسم المورد", "اسم المصنع",
    ...(seeCost ? ["سعر الشراء"] : []), "سعر البيع", "سعر الجملة",
    ...(levels ?? []).map((l) => `سعر ${levelName(l)}`), ...stores.map((x) => `رصيد ${storeName(x)}`)];
  const data: SheetData = [head.map((h) => ({ value: h, fontWeight: "bold" as const }))];

  if (withItems) {
    type V = { variant_id: string; sku: string | null; product_id: string; name_en: string; name_ar: string; option1: string | null; option2: string | null; option3: string | null; price: number; wholesale_price: number | null; cost: number | null };
    const items: V[] = [];
    for (let from = 0; from < 100_000; from += 1000) {
      const { data: page } = await db().from("variant_prices").select("variant_id, sku, product_id, name_en, name_ar, option1, option2, option3, price, wholesale_price, cost")
        .not("sku", "is", null).order("name_en").order("variant_id").range(from, from + 999);
      items.push(...((page ?? []) as V[]));
      if (!page || page.length < 1000) break;
    }
    const pids = [...new Set(items.map((v) => v.product_id))];
    const prod = new Map<string, { unit: string; group_id: string | null; supplier_name: string | null; factory_name: string | null }>();
    for (let i = 0; i < pids.length; i += 500) {
      const { data: ps } = await db().from("products").select("id, unit, group_id, supplier_name, factory_name").in("id", pids.slice(i, i + 500));
      for (const p of ps ?? []) prod.set(p.id, { unit: p.unit, group_id: p.group_id, supplier_name: p.supplier_name, factory_name: p.factory_name });
    }
    const { data: groups } = await db().from("product_groups").select("id, name_en, name_ar");
    const vids = items.map((v) => v.variant_id);
    const lp = new Map<string, number>(), qty = new Map<string, number>();
    for (let i = 0; i < vids.length; i += 500) {
      const chunk = vids.slice(i, i + 500);
      const [{ data: l }, { data: q }] = await Promise.all([
        levels?.length ? db().from("variant_level_prices").select("variant_id, level_id, price").in("variant_id", chunk) : Promise.resolve({ data: [] as { variant_id: string; level_id: string; price: number }[] }),
        stores.length ? db().from("stock_levels").select("variant_id, location_id, qty").in("variant_id", chunk).in("location_id", stores.map((x) => x.id)) : Promise.resolve({ data: [] as { variant_id: string; location_id: string; qty: number }[] }),
      ]);
      for (const x of l ?? []) lp.set(`${x.variant_id}|${x.level_id}`, Number(x.price));
      for (const x of q ?? []) qty.set(`${x.variant_id}|${x.location_id}`, Number(x.qty));
    }
    const num = (v: number | null | undefined) => (v === null || v === undefined ? null : { value: Number(v), type: Number });
    for (const v of items) {
      const p = prod.get(v.product_id);
      const g = groups?.find((x) => x.id === p?.group_id);
      data.push([
        { value: String(v.sku), type: String },
        v.name_ar || null, v.name_en || null,
        [v.option1, v.option2, v.option3].filter(Boolean).join(" / ") || null,
        p ? UNIT_AR[p.unit] ?? p.unit : null,
        g ? g.name_ar || g.name_en : null,
        p?.supplier_name || null, p?.factory_name || null,
        ...(seeCost ? [num(v.cost)] : []), num(v.price), num(v.wholesale_price),
        ...(levels ?? []).map((l) => num(lp.get(`${v.variant_id}|${l.id}`))),
        ...stores.map((x) => num(qty.get(`${v.variant_id}|${x.id}`) ?? 0)),
      ]);
    }
  }

  const buffer = await writeXlsxFile(data, { sheet: "الأسعار والمخزون", rightToLeft: true, stickyRowsCount: 1, columns: head.map((h, i) => ({ width: i === 1 ? 40 : i <= 3 ? 22 : 14 })) }).toBuffer();
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  const name = withItems ? `prices-and-stock-${day}.xlsx` : "prices-and-stock-form.xlsx";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
