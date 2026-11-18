import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { PageHeader } from "@/components/PageHeader";
import { ProductUpload } from "@/components/ProductUpload";
import { PriceFile } from "@/components/PriceFile";
import { db } from "@/lib/supabase/admin";

export const maxDuration = 300;

export default async function UploadPage() {
  const me = await requirePermission("upload.import");
  const { t, locale } = await getDict();
  // one column per price level (wholesale has its own "wholesale" column)
  const { data: lv } = await db().from("price_levels").select("id, name_en, name_ar").eq("active", true).neq("code", "wholesale").order("sort");
  const levels = (lv ?? []).map((l) => ({ id: l.id, names: [l.name_en, l.name_ar].filter(Boolean), label: (locale === "ar" && l.name_ar) || l.name_en }));
  // one quantity column per store (saved as a count) — for people who may count stock there
  const { data: locs } = me.perms.has("stock.count") ? await db().from("locations").select("id, code, name_en, name_ar").eq("active", true).order("code") : { data: [] };
  const stores = (locs ?? []).filter((l) => me.locations === "all" || me.locations.includes(l.id))
    .map((l) => ({ id: l.id, names: [l.name_en, l.name_ar, l.code].filter(Boolean), label: (locale === "ar" && l.name_ar) || l.name_en }));
  return (
    <>
      <PageHeader title={t.upload.title} subtitle={t.upload.subtitle} t={t} />
      <ProductUpload t={t} />
      {me.perms.has("products.edit") && <div className="mt-6"><PriceFile t={t} levels={levels} stores={stores} canAdd={me.perms.has("products.add") || me.perms.has("products.edit")} /></div>}
    </>
  );
}
