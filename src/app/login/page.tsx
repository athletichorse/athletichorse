import { redirect } from "next/navigation";
import { getDict } from "@/lib/locale";
import { getStaff } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { switchLocaleAction } from "@/app/actions/auth";

export default async function LoginPage() {
  if (await getStaff()) redirect("/");
  const { t } = await getDict();
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <div className="mb-4 flex items-center">
          <h1 className="flex-1 text-xl font-bold">{t.login.title}</h1>
          <form action={switchLocaleAction}><button className="text-sm text-[var(--brand)] underline">{t.switchLang}</button></form>
        </div>
        <p className="mb-4 text-sm text-gray-500">{t.companyPlaceholder} — {t.appName}</p>
        <LoginForm t={t} />
      </div>
    </main>
  );
}
