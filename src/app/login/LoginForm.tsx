"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import type { Dict } from "@/i18n";

export function LoginForm({ t }: { t: Dict }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="username">{t.login.username}</label>
        <input className="input" id="username" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required dir="ltr" />
      </div>
      <div>
        <label className="label" htmlFor="password">{t.login.password}</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required dir="ltr" />
      </div>
      {state?.error && <p className="alert-err">{state.error === "hours" ? t.login.hours : state.error === "device" ? t.login.device : t.login.invalid}</p>}
      <button className="btn-primary w-full" disabled={pending}>{t.login.submit}</button>
    </form>
  );
}
