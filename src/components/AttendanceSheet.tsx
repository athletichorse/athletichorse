"use client";

import { useState } from "react";
import type { Dict } from "@/i18n";
import { saveAttendanceAction } from "@/app/actions/payroll";

type Cell = { status: string; overtime: string };
const CODES: Record<string, string> = { present: "✓", late: "L", absent: "A", unexcused: "U", leave: "V", off: "–" };

/** People × days. Click a cell to cycle status, or pick from the list; overtime hours below. */
export function AttendanceSheet({ t, month, days, people, initial }: { t: Dict; month: string; days: number; people: { id: string; name: string }[]; initial: { profileId: string; day: string; status: string; overtime: string }[] }) {
  const P = t.pay;
  const [cells, setCells] = useState<Record<string, Cell>>(() => Object.fromEntries(initial.map((r) => [`${r.profileId}|${r.day}`, { status: r.status, overtime: r.overtime === "0" ? "" : r.overtime }])));
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const dayStr = (d: number) => `${month.slice(0, 8)}${String(d).padStart(2, "0")}`;
  const set = (k: string, patch: Partial<Cell>) => { setCells((c) => ({ ...c, [k]: { status: c[k]?.status ?? "present", overtime: c[k]?.overtime ?? "", ...patch } })); setDirty((d) => new Set(d).add(k)); };
  return (
    <section className="card space-y-3 p-0">
      <div className="flex flex-wrap gap-3 px-5 pt-5 text-xs text-gray-600">{Object.entries(CODES).map(([k, c]) => <span key={k}><b>{c}</b> {P.st[k as keyof typeof P.st]}</span>)}</div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs" data-export>
          <thead><tr><th className="sticky start-0 z-10 bg-gray-50 px-3 py-2 text-start">{P.employee}</th>{Array.from({ length: days }, (_, i) => <th key={i} className="bg-gray-50 px-1 py-2 font-medium text-gray-500">{i + 1}</th>)}</tr></thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="border-t border-[var(--line)]">
                <td className="sticky start-0 z-10 bg-white px-3 py-1 font-medium whitespace-nowrap">{p.name}</td>
                {Array.from({ length: days }, (_, i) => {
                  const k = `${p.id}|${dayStr(i + 1)}`; const c = cells[k];
                  return (
                    <td key={i} className="px-0.5 py-1 text-center">
                      <select aria-label={`${p.name} ${i + 1}`} value={c?.status ?? ""} onChange={(e) => set(k, { status: e.target.value })}
                        className={`w-11 rounded border px-0.5 py-1 text-center ${c?.status === "absent" || c?.status === "unexcused" ? "border-red-200 bg-red-50" : c?.status === "late" ? "border-amber-200 bg-amber-50" : "border-[var(--line)]"}`}>
                        <option value="">·</option>{Object.entries(CODES).map(([s, code]) => <option key={s} value={s}>{code}</option>)}
                      </select>
                      <input aria-label="overtime" value={c?.overtime ?? ""} onChange={(e) => set(k, { overtime: e.target.value })} placeholder="+h" className="mt-0.5 w-11 rounded border border-[var(--line)] px-0.5 text-center" dir="ltr" inputMode="decimal" />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {msg && <p className={`mx-5 ${msg.ok ? "alert-ok" : "alert-err"}`}>{msg.text}</p>}
      <div className="flex justify-end px-5 pb-5">
        <button className="btn-primary" disabled={busy || dirty.size === 0} onClick={async () => {
          setBusy(true); setMsg(null);
          const rows = [...dirty].map((k) => { const [profileId, day] = k.split("|"); return { profileId, day, status: cells[k]?.status ?? "", overtime: cells[k]?.overtime || "0" }; });
          const r = await saveAttendanceAction(rows);
          setBusy(false);
          if (r.ok) { setDirty(new Set()); setMsg({ ok: true, text: P.saved }); } else setMsg({ ok: false, text: (P.errors as Record<string, string>)[r.error] ?? r.error });
        }}>{P.save} ({dirty.size})</button>
      </div>
    </section>
  );
}
