import { redirect } from "next/navigation";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { ownerExists } from "@/app/actions/setup";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await ownerExists()) redirect("/login");
  const { t, locale } = await getDict();
  // Safe: this page only renders while no staff exist, and shows branch names only.
  const { data } = await db().from("locations").select("id, name_ar, name_en").eq("kind", "branch").eq("active", true).order("code");
  const branches = (data ?? []).map((b) => ({ id: b.id, name: locale === "ar" ? b.name_ar : b.name_en || b.name_ar }));
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-md">
        <h1 className="mb-1 text-xl font-bold">{t.setup.title}</h1>
        <p className="mb-4 text-sm text-gray-500">{t.setup.intro}</p>
        <SetupForm t={t} branches={branches} />
      </div>
    </main>
  );
}
