"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict } from "@/i18n";
import { setB2bStatusAction } from "@/app/actions/b2b";
import { b2bNext, type B2bStatus } from "@/lib/purchasing";

/** The next stages of a B2B order; each asks "Sure?" first. Invoicing asks for the invoice no. */
export function B2bStatusButtons({ t, orderId, status }: { t: Dict; orderId: string; status: B2bStatus }) {
  const B = t.b2b;
  const router = useRouter();
  const [ask, setAsk] = useState<B2bStatus | null>(null);
  const [inv, setInv] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const next = b2bNext(status);
  if (!next.length) return null;

  async function go(s: B2bStatus) {
    setBusy(true); setErr("");
    const r = await setB2bStatusAction(orderId, s, inv).catch(() => ({ ok: false as const, error: "network" }));
    setBusy(false); setAsk(null);
    if (!r.ok) return setErr((B.errors as Record<string, string>)[r.error] ?? r.error);
    router.refresh();
  }
  return (
    <div className="no-print" data-testid="b2b-steps">
      {err && <p className="alert-err mb-2" role="status">{err}</p>}
      {ask ? (
        <div className="flex flex-wrap items-center gap-2" role="alertdialog" aria-label={B.sure[ask as keyof typeof B.sure]}>
          <span className="text-sm font-medium">{B.sure[ask as keyof typeof B.sure]}</span>
          {ask === "invoiced" && <input className="input w-40" dir="ltr" placeholder={B.invoiceRef} aria-label={B.invoiceRef} value={inv} maxLength={60} onChange={(e) => setInv(e.target.value)} />}
          <button type="button" className={ask === "cancelled" ? "btn-primary !bg-red-700" : "btn-primary"} disabled={busy} onClick={() => go(ask)} data-testid="b2b-yes">{busy ? B.working : B.yes}</button>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => setAsk(null)}>{B.no}</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {next.map((s) => (
            <button key={s} type="button" className={s === "cancelled" ? "btn-ghost text-red-700" : s === next[0] ? "btn-primary" : "btn-ghost"} onClick={() => setAsk(s)} data-testid={`b2b-to-${s}`}>
              {B.next[s as keyof typeof B.next]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
