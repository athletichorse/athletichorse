"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";

const KINDS = ["branch", "warehouse", "sub_store"] as const;
const back = (err?: string) => redirect(err ? `/locations?err=${encodeURIComponent(err)}` : "/locations?ok=1");

export async function saveLocationAction(form: FormData) {
  await assertPermission("locations.edit");
  const id = String(form.get("id") ?? "") || null;
  const kind = String(form.get("kind") ?? "");
  if (!(KINDS as readonly string[]).includes(kind)) return back("kind");
  const row = {
    code: String(form.get("code") ?? "").trim().toUpperCase(),
    name_ar: String(form.get("name_ar") ?? "").trim(),
    name_en: String(form.get("name_en") ?? "").trim(),
    kind,
    parent_id: kind === "sub_store" ? String(form.get("parent_id") ?? "") || null : null,
    uses_pos: form.get("uses_pos") === "on",
    address_ar: String(form.get("address_ar") ?? "").trim(),
    address_en: String(form.get("address_en") ?? "").trim(),
    active: id ? form.get("active") === "on" : true,
  };
  if (!/^[A-Z0-9_-]{2,20}$/.test(row.code)) return back("code");
  if (!row.name_ar) return back("name_ar");
  if (kind === "sub_store" && !row.parent_id) return back("parent");
  if (row.parent_id && row.parent_id === id) return back("parent");

  const { error } = id ? await db().from("locations").update(row).eq("id", id) : await db().from("locations").insert(row);
  if (error) return back(error.message);
  revalidatePath("/locations");
  back();
}
