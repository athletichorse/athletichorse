"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

const back = (q: string) => redirect(`/products/levels?${q}`);
const names = (form: FormData) => ({
  name_en: String(form.get("name_en") ?? "").trim().slice(0, 60),
  name_ar: String(form.get("name_ar") ?? "").trim().slice(0, 60),
  sort: Math.max(0, Math.min(999, Math.floor(Number(form.get("sort")) || 0))),
});

/** New price level (e.g. VIP). Its code comes from the English name. */
export async function createLevelAction(form: FormData) {
  const staff = await assertPermission("products.edit");
  const n = names(form);
  if (!n.name_en && !n.name_ar) return back("err=name");
  const base = (n.name_en || "level").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "level";
  const code = base === "wholesale" ? `wholesale_${Date.now().toString(36).slice(-4)}` : `${base}_${Date.now().toString(36).slice(-4)}`;
  const [{ data: sameEn }, { data: sameAr }] = await Promise.all([
    n.name_en ? db().from("price_levels").select("id").ilike("name_en", n.name_en.replace(/[%_\\]/g, "")).limit(1) : Promise.resolve({ data: [] }),
    n.name_ar ? db().from("price_levels").select("id").eq("name_ar", n.name_ar).limit(1) : Promise.resolve({ data: [] }),
  ]);
  if (sameEn?.length || sameAr?.length) return back("err=duplicate");
  const { data, error } = await db().from("price_levels").insert({ code, name_en: n.name_en || n.name_ar, name_ar: n.name_ar, sort: n.sort }).select("id").single();
  if (error || !data) return back(`err=${encodeURIComponent(error?.message ?? "error")}`);
  await audit(staff.id, "price_level.create", "price_level", data.id, { name: n.name_en || n.name_ar });
  revalidatePath("/products/levels");
  back("ok=1");
}

/** Rename, reorder, turn a level on or off. */
export async function saveLevelAction(form: FormData) {
  const staff = await assertPermission("products.edit");
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return back("err=bad_request");
  const n = names(form);
  if (!n.name_en && !n.name_ar) return back("err=name");
  const { error } = await db().from("price_levels").update({ name_en: n.name_en || n.name_ar, name_ar: n.name_ar, sort: n.sort, active: form.get("active") === "on" }).eq("id", id);
  if (error) return back(`err=${encodeURIComponent(error.message)}`);
  await audit(staff.id, "price_level.update", "price_level", id, { name: n.name_en || n.name_ar, active: form.get("active") === "on" });
  revalidatePath("/products/levels");
  back("ok=1");
}
