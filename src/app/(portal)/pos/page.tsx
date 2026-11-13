import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { PageHeader } from "@/components/PageHeader";

export default async function PosPage() {
  const s = await requireStaff();
  if (!(["pos.collect", "pos.desk", "pos.quick_sale"] as const).some((k) => s.perms.has(k))) redirect("/forbidden");
  const { t } = await getDict();
  return (
    <>
      <PageHeader title={t.menu.pos} t={t} />
      <div className="card text-gray-500">{t.comingSoon}</div>
    </>
  );
}
