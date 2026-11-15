import type { PermissionKey } from "@/lib/permissions";
import type { Dict } from "@/i18n";
import { requirePermission, requireStaff } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { PageHeader } from "./PageHeader";
import { Icon, type IconName } from "./icons";

export function ComingSoonCard({ t, icon }: { t: Dict; icon: IconName }) {
  return (
    <div className="card flex flex-col items-center py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <div className="font-semibold text-gray-900">{t.comingSoonTitle}</div>
      <p className="mt-1 max-w-sm text-sm text-gray-500">{t.comingSoon}</p>
    </div>
  );
}

export async function ComingSoon({ perm, title, icon }: { perm: PermissionKey | PermissionKey[]; title: (t: Dict) => string; icon: IconName }) {
  if (Array.isArray(perm)) {
    const s = await requireStaff();
    if (!perm.some((p) => s.perms.has(p))) await requirePermission(perm[0]);
  } else {
    await requirePermission(perm);
  }
  const { t } = await getDict();
  return (
    <>
      <PageHeader title={title(t)} t={t} />
      <ComingSoonCard t={t} icon={icon} />
    </>
  );
}
