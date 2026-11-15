"use client";

import { useActionState } from "react";
import { setupOwnerAction } from "@/app/actions/setup";
import type { Dict } from "@/i18n";

export function SetupForm({ t, branches }: { t: Dict; branches: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(setupOwnerAction, undefined);
  const err = state?.error;
  const msg = err === "badSecret" ? t.setup.badSecret : err === "done" ? t.setup.done : err ? t.setup.error + err : null;
  return (
    <form action={action} className="space-y-3">
      <div><label className="label">{t.setup.secret}</label><input className="input" name="secret" type="password" required dir="ltr" /></div>
      <div><label className="label">{t.login.username}</label><input className="input" name="username" required dir="ltr" pattern="[a-z0-9._\-]{3,32}" /></div>
      <div><label className="label">{t.setup.fullName}</label><input className="input" name="full_name" required /></div>
      <div><label className="label">{t.login.password}</label><input className="input" name="password" type="password" minLength={10} required dir="ltr" /></div>
      <div><label className="label">{t.setup.pin}</label><input className="input" name="pin" inputMode="numeric" pattern="\d{4,8}" required dir="ltr" /></div>
      <div>
        <label className="label">{t.setup.branch}</label>
        <select className="input" name="branch_id">
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      <button className="btn-primary w-full" disabled={pending}>{t.setup.submit}</button>
    </form>
  );
}
