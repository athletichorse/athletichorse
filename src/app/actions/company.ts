"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertPermission } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { isValidCrNumber, isValidVatNumber, toLatinDigits } from "@/lib/saudi";

const back = (err?: string) => redirect(err ? `/company?err=${encodeURIComponent(err)}` : "/company?ok=1");

export async function saveCompanyAction(form: FormData) {
  await assertPermission("settings.edit");
  const vat = toLatinDigits(String(form.get("vat_number") ?? "").trim());
  const cr = toLatinDigits(String(form.get("cr_number") ?? "").trim());
  const rate = toLatinDigits(String(form.get("vat_rate") ?? "").trim());
  if (vat && !isValidVatNumber(vat)) return back("vat");
  if (cr && !isValidCrNumber(cr)) return back("cr");
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(rate)) return back("rate");
  const logo = String(form.get("logo_url") ?? "").trim();
  if (logo && !/^https:\/\//.test(logo)) return back("logo");

  const { error } = await db().from("company").upsert({
    id: 1,
    legal_name_ar: String(form.get("legal_name_ar") ?? "").trim(),
    legal_name_en: String(form.get("legal_name_en") ?? "").trim(),
    vat_number: vat || null,
    cr_number: cr || null,
    address_ar: String(form.get("address_ar") ?? "").trim(),
    address_en: String(form.get("address_en") ?? "").trim(),
    logo_url: logo || null,
  });
  if (error) return back(error.message);
  const { error: e2 } = await db().from("settings").upsert({ key: "vat_rate", value: Number(rate).toFixed(2) });
  if (e2) return back(e2.message);
  revalidatePath("/company");
  back();
}
