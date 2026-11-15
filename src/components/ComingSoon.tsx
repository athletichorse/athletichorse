import type { PermissionKey } from "@/lib/permissions";
import type { Dict } from "@/i18n";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { PageHeader } from "./PageHeader";

export async function ComingSoon({ perm, title }: { perm: PermissionKey; title: (t: Dict) => string }) {
  await requirePermission(perm);
  const { t } = await getDict();
  return (
    <>
      <PageHeader title={title(t)} t={t} />
      <div className="card text-gray-500">{t.comingSoon}</div>
    </>
  );
}
