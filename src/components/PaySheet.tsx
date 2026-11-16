"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict } from "@/i18n";
import { computeSheetAction, payLineAction, setSheetStatusAction } from "@/app/actions/payroll";

export type SheetCol = { key: string; label: string; money?: boolean };
export type SheetRow = { profileId: string; name: string; values: Record<string, string | number>; amount: string; paidVia: string | null };

/** Payroll / commission month sheet: calculate (draft) → approve → pay per person; resizable columns. */
export function PaySheet({ t, sheet, month, status, cols, rows, canEdit }: { t: Dict; sheet: "payroll" | "commission"; month: string; status: "draft" | "approved" | "paid" | null; cols: SheetCol[]; rows: SheetRow[]; canEdit: boolean }) {
  const P = t.pay;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setBusy(true); setMsg(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setMsg({ ok: false, text: (P.errors as Record<string, string>)[r.error] ?? r.error }); else router.refresh();
  };
  const total = rows.reduce((a, r) => a + Number(r.amount), 0);
  return (
    <section className="space-y-3">
      <div className="no-print flex flex-wrap items-center gap-2">
        <span className={status === "paid" ? "badge-green" : status === "approved" ? "badge-blue" : "badge-gray"}>{status ? P.status[status] : "—"}</span>
        {canEdit && (status === null || status === "draft") && <button className="btn-primary" disabled={busy} onClick={() => run(() => computeSheetAction(sheet, month))}>{status ? P.refresh : P.compute}</button>}
        {canEdit && status === "draft" && rows.length > 0 && <button className="btn-ghost" disabled={busy} onClick={() => run(() => setSheetStatusAction(sheet, month, "approved"))}>{P.approve}</button>}
        {canEdit && status === "approved" && <button className="btn-ghost" disabled={busy} onClick={() => run(() => setSheetStatusAction(sheet, month, "draft"))}>{P.reopen}</button>}
        {rows.length > 0 && <a href={`/staff/slips?sheet=${sheet}&month=${month.slice(0, 7)}`} target="_blank" rel="noopener" className="btn-ghost">{P.slips}</a>}
      </div>
      {msg && <p className={msg.ok ? "alert-ok" : "alert-err"}>{msg.text}</p>}
      <div className="card overflow-hidden p-0"><div className="overflow-x-auto">
        <table className="table" data-export>
          <thead><tr>
            <th style={{ resize: "horizontal", overflow: "auto" }}>{P.employee}</th>
            {cols.map((c) => <th key={c.key} style={{ resize: "horizontal", overflow: "auto", minWidth: 70 }}>{c.label}</th>)}
            <th className="no-print"></th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={cols.length + 2} className="py-8 text-center text-gray-500">{P.none}</td></tr>}
            {rows.map((r) => (
              <tr key={r.profileId}>
                <td className="cell-title">{r.name}</td>
                {cols.map((c) => <td key={c.key} data-label={c.label} dir="ltr" className={c.key === "net" || c.key === "total" ? "font-semibold" : ""}>{c.money ? Number(r.values[c.key] ?? 0).toFixed(2) : r.values[c.key]}</td>)}
                <td className="no-print whitespace-nowrap">
                  {r.paidVia ? <span className="badge-green">{P.paid} · {r.paidVia === "bank" ? P.payBank : P.payDrawer}</span>
                    : canEdit && status !== "draft" && status !== null && (
                      <span className="flex gap-1">
                        <button className="btn-ghost py-1" disabled={busy} onClick={() => run(() => payLineAction(sheet, month, r.profileId, "drawer"))}>{P.payDrawer}</button>
                        <button className="btn-ghost py-1" disabled={busy} onClick={() => run(() => payLineAction(sheet, month, r.profileId, "bank"))}>{P.payBank}</button>
                      </span>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && <tfoot><tr><td className="font-semibold">{P.total}</td>{cols.map((c) => <td key={c.key} dir="ltr" className="font-semibold">{c.key === "net" || c.key === "total" ? total.toFixed(2) : ""}</td>)}<td></td></tr></tfoot>}
        </table>
      </div></div>
    </section>
  );
}
