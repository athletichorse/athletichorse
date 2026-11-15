import { requireStaff } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { TopMenu } from "@/components/TopMenu";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const { t } = await getDict();
  return (
    <>
      <TopMenu t={t} perms={staff.perms} name={staff.fullName} />
      <main className="mx-auto max-w-7xl p-4">{children}</main>
    </>
  );
}
