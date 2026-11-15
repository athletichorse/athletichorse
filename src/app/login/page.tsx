import { redirect } from "next/navigation";
import { getDict } from "@/lib/locale";
import { getStaff } from "@/lib/auth";
import { AuthCard } from "@/components/AuthCard";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getStaff()) redirect("/");
  const { t } = await getDict();
  return (
    <AuthCard t={t} title={t.login.title}>
      <LoginForm t={t} />
    </AuthCard>
  );
}
