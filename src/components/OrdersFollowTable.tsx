"use client";

import { useState } from "react";
import type { Dict } from "@/i18n";
import { saveFollowAction } from "@/app/actions/orders";
import type { FollowStatus } from "@/lib/order-follow";

export type FollowRow = {
  id: string; name: string; address: string; date: string; amount: string; paidOnline: boolean; web: string;
  status: FollowStatus; courier: string; waybill: string; size: "normal" | "bulky"; branchId: string; notes: string;
};
const TONE: Record<FollowStatus, string> = {
  new: "bg-gray-100 text-gray-800", confirmed: "bg-blue-50 text-blue-800", shipped: "bg-indigo-50 text-indigo-800", delivered: "bg-teal-50 text-teal-800",
  collected: "bg-emerald-50 text-emerald-800", returned: "bg-amber-50 text-amber-800", cancelled: "bg-red-50 text-red-700",
};

/** The follow-up table: every editable cell saves on its own (✓ when saved). */
export function OrdersFollowTable({ t, rows, branches, couriers }: { t: Dict; rows: FollowRow[]; branches: { id: string; name: string }[]; couriers: string[] }) {
  const O = t.orders;
  const [data, setData] = useState(rows);
  const [mark, setMark] = useState<Record<string, "ok" | "err">>({});
  async function save(r: FollowRow, field: "status" | "courier" | "waybill" | "size" | "branch_id" | "notes", value: string) {
    const key = `${r.id}:${field}`;
    const res = await saveFollowAction(r.id, field, value).catch(() => ({ ok: false as const, error: "network" }));
    setMark((m) => ({ ...m, [key]: res.ok ? "ok" : "err" }));
  }
  const set = (id: string, patch: Partial<FollowRow>) => setData((d) => d.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const tick = (id: string, f: string) => (mark[`${id}:${f}`] === "ok" ? <span className="text-emerald-600" aria-label={O.saved}> ✓</span> : mark[`${id}:${f}`] === "err" ? <span className="text-red-600"> ✗</span> : null);

  if (!data.length) return <p className="card text-sm text-gray-500">{O.none}</p>;
  return (
    <div className="card overflow-hidden p-0"><div className="overflow-x-auto">
      <table className="table" data-export data-testid="orders-table">
        <thead><tr><th>{O.order}</th><th>{O.address}</th><th>{O.date}</th><th>{O.courier}</th><th>{O.waybill}</th><th>{O.amount}</th><th>{O.web}</th><th>{O.status}</th><th>{O.size}</th><th>{O.branch}</th><th>{O.notes}</th></tr></thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.id} data-order={r.name}>
              <td className="cell-title font-semibold text-[var(--brand)]" dir="ltr">{r.name}</td>
              <td data-label={O.address} className="min-w-[10rem]">{r.address || "—"}</td>
              <td data-label={O.date} className="whitespace-nowrap text-sm">{r.date}</td>
              <td data-label={O.courier} className="min-w-[8rem]">
                <input className="input py-1 text-sm" list="order-couriers" aria-label={`${O.courier} ${r.name}`} value={r.courier} onChange={(e) => set(r.id, { courier: e.target.value })} onBlur={(e) => void save(r, "courier", e.target.value)} />{tick(r.id, "courier")}
              </td>
              <td data-label={O.waybill} className="min-w-[9rem]">
                <input className={`input py-1 text-sm ${r.waybill ? "" : "bg-red-50"}`} dir="ltr" aria-label={`${O.waybill} ${r.name}`} value={r.waybill} onChange={(e) => set(r.id, { waybill: e.target.value })} onBlur={(e) => void save(r, "waybill", e.target.value)} />{tick(r.id, "waybill")}
              </td>
              <td data-label={O.amount} dir="ltr" className="font-semibold">{r.amount}{r.paidOnline && <span className="badge-green ms-1 text-xs">{O.paidOnline}</span>}</td>
              <td data-label={O.web}><span className={`badge text-xs ${r.web === "fulfilled" ? "bg-emerald-50 text-emerald-800" : r.web === "cancelled" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{O.webStatuses[r.web as keyof typeof O.webStatuses] ?? r.web}</span></td>
              <td data-label={O.status}>
                <select className={`input py-1 text-sm font-medium ${TONE[r.status]}`} aria-label={`${O.status} ${r.name}`} value={r.status} onChange={(e) => { const v = e.target.value as FollowStatus; set(r.id, { status: v }); void save(r, "status", v); }}>
                  {(Object.keys(O.statuses) as FollowStatus[]).map((k) => <option key={k} value={k}>{O.statuses[k]}</option>)}
                </select>{tick(r.id, "status")}
              </td>
              <td data-label={O.size}>
                <select className="input py-1 text-sm" aria-label={`${O.size} ${r.name}`} value={r.size} onChange={(e) => { const v = e.target.value as "normal" | "bulky"; set(r.id, { size: v }); void save(r, "size", v); }}>
                  <option value="normal">{O.sizes.normal}</option><option value="bulky">{O.sizes.bulky}</option>
                </select>{tick(r.id, "size")}
              </td>
              <td data-label={O.branch}>
                <select className="input py-1 text-sm" aria-label={`${O.branch} ${r.name}`} value={r.branchId} onChange={(e) => { set(r.id, { branchId: e.target.value }); void save(r, "branch_id", e.target.value); }}>
                  <option value="">—</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>{tick(r.id, "branch_id")}
              </td>
              <td data-label={O.notes} className="min-w-[10rem]">
                <input className="input py-1 text-sm" aria-label={`${O.notes} ${r.name}`} value={r.notes} maxLength={500} onChange={(e) => set(r.id, { notes: e.target.value })} onBlur={(e) => void save(r, "notes", e.target.value)} />{tick(r.id, "notes")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <datalist id="order-couriers">{couriers.map((c) => <option key={c} value={c} />)}</datalist>
    </div></div>
  );
}
