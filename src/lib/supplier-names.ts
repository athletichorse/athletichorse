import { db } from "@/lib/supabase/admin";

/** Supplier and factory names already used on items (for the pick-or-type lists). */
export async function supplierNames(): Promise<{ suppliers: string[]; factories: string[] }> {
  const { data } = await db().from("products").select("supplier_name, factory_name").or("supplier_name.not.is.null,factory_name.not.is.null").limit(20000);
  const uniq = (xs: (string | null)[]) => [...new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
  return { suppliers: uniq((data ?? []).map((r) => r.supplier_name)), factories: uniq((data ?? []).map((r) => r.factory_name)) };
}
