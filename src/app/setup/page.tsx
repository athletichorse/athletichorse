import { redirect } from "next/navigation";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { ownerExists } from "@/app/actions/setup";
import { SetupForm } from "./SetupForm";
import { AuthCard } from "@/components/AuthCard";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await ownerExists()) redirect("/login");
  const { t, locale } = await getDict();
  // Safe: this page only renders while no staff exist, and shows branch names only.
  const { data } = await db().from("locations").select("id, name_ar, name_en").eq("kind", "branch").eq("active", true).order("code");
  const branches = (data ?? []).map((b) => ({ id: b.id, name: locale === "ar" ? b.name_ar : b.name_en || b.name_ar }));
  return (
    <AuthCard t={t} title={t.setup.title} subtitle={t.setup.intro}>
      <SetupForm t={t} branches={branches} />
    </AuthCard>
  );
}
