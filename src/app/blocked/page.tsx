import { getDict } from "@/lib/locale";
import { AuthCard } from "@/components/AuthCard";
import { logoutAction } from "@/app/actions/auth";

/** Shown when working hours or device approval stop someone (never the owner). */
export default async function Blocked({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const { t } = await getDict();
  const sp = await searchParams;
  return (
    <AuthCard t={t} title={t.security.blockedTitle} path="/blocked">
      <p className="alert-err">{sp.r === "device" ? t.login.device : t.login.hours}</p>
      <form action={logoutAction}><button className="btn-primary w-full">{t.logout}</button></form>
    </AuthCard>
  );
}
