import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { createGroupAction, saveGroupAction } from "@/app/actions/products";

type G = { id: string; parent_id: string | null; name_en: string; name_ar: string };

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string }> }) {
  await requirePermission("products.edit");
  const { t } = await getDict();
  const sp = await searchParams;
  const { data } = await db().from("product_groups").select("id, parent_id, name_en, name_ar").order("name_en");
  const groups = (data ?? []) as G[];
  const top = groups.filter((g) => !g.parent_id);
  const row = (g: G, sub = false) => (
    <form key={g.id} action={saveGroupAction} className={`grid grid-cols-[1fr_1fr_auto] items-center gap-2 py-2 ${sub ? "ps-6" : ""}`}>
      <input type="hidden" name="id" value={g.id} />
      <input name="name_en" defaultValue={g.name_en} className="input" dir="ltr" required />
      <input name="name_ar" defaultValue={g.name_ar} className="input" dir="rtl" placeholder={t.locations.nameAr} />
      <button className="btn-ghost">{t.save}</button>
    </form>
  );
  return (
    <>
      <PageHeader title={t.products.groups} t={t}>
        <Link href="/products" className="btn-ghost no-print">← {t.products.title}</Link>
      </PageHeader>
      {sp.err && <p className="alert-err">{sp.err}</p>}
      {sp.ok && <p className="alert-ok">{t.saved}</p>}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="card divide-y divide-[var(--line)]">
          {top.map((g) => (
            <div key={g.id}>
              {row(g)}
              {groups.filter((s) => s.parent_id === g.id).map((s) => row(s, true))}
            </div>
          ))}
        </section>
        <form action={createGroupAction} className="card h-fit space-y-4">
          <h2 className="card-title">{t.products.newGroup}</h2>
          <div><label className="label">{t.locations.nameEn}</label><input name="name_en" className="input" dir="ltr" required /></div>
          <div><label className="label">{t.locations.nameAr}</label><input name="name_ar" className="input" dir="rtl" /></div>
          <div>
            <label className="label">{t.products.parentGroup}</label>
            <select name="parent_id" className="input">
              <option value="">—</option>
              {top.map((g) => <option key={g.id} value={g.id}>{g.name_en}</option>)}
            </select>
          </div>
          <div className="flex justify-end"><button className="btn-primary">{t.add}</button></div>
        </form>
      </div>
    </>
  );
}
