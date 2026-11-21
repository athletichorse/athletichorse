"use client";

import { useState } from "react";
import Link from "next/link";
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
  const sel = "input min-w-[6.5rem] py-1 text-sm";
  return (
    <div className="card overflow-hidden p-0"><div className="overflow-x-auto">
      {/* 6 columns, related details stacked, so the whole row fits on the screen */}
      <table className="table table-compact" data-export data-testid="orders-table">
        <thead><tr>
          <th>{O.order} / {O.date}</th><th>{O.address}</th><th>{O.courier} / {O.waybill}</th><th>{O.amount} / {O.web}</th><th>{O.status} / {O.size}</th><th>{O.branch} / {O.notes}</th>
        </tr></thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.id} data-order={r.name}>
              <td className="cell-title whitespace-nowrap">
                <Link href={`/sales/orders/${r.id}`} className="font-semibold text-[var(--brand)] underline-offset-2 hover:underline" dir="ltr" data-testid="order-link">{r.name}</Link>
                <div className="text-xs font-normal text-gray-500">{r.date}</div>
              </td>
              <td data-label={O.address} className="max-w-[14rem] text-sm leading-snug">{r.address || "—"}</td>
              <td data-label={O.courier} className="min-w-[9rem]">
                <div className="flex items-center gap-1"><input className="input py-1 text-sm" list="order-couriers" placeholder={O.courier} aria-label={`${O.courier} ${r.name}`} value={r.courier} onChange={(e) => set(r.id, { courier: e.target.value })} onBlur={(e) => void save(r, "courier", e.target.value)} />{tick(r.id, "courier")}</div>
                <div className="mt-1 flex items-center gap-1"><input className={`input py-1 text-sm ${r.waybill ? "" : "bg-red-50"}`} dir="ltr" placeholder={O.waybill} aria-label={`${O.waybill} ${r.name}`} value={r.waybill} onChange={(e) => set(r.id, { waybill: e.target.value })} onBlur={(e) => void save(r, "waybill", e.target.value)} />{tick(r.id, "waybill")}</div>
              </td>
              <td data-label={O.amount} className="whitespace-nowrap">
                <div dir="ltr" className="font-semibold">{r.amount}</div>
                {r.paidOnline && <div><span className="badge-green text-xs">{O.paidOnline}</span></div>}
                <div className="mt-1"><span className={`badge text-xs ${r.web === "fulfilled" ? "bg-emerald-50 text-emerald-800" : r.web === "cancelled" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{O.webStatuses[r.web as keyof typeof O.webStatuses] ?? r.web}</span></div>
              </td>
              <td data-label={O.status}>
                <div className="flex items-center gap-1">
                  <select className={`${sel} font-medium ${TONE[r.status]}`} aria-label={`${O.status} ${r.name}`} value={r.status} onChange={(e) => { const v = e.target.value as FollowStatus; set(r.id, { status: v }); void save(r, "status", v); }}>
                    {(Object.keys(O.statuses) as FollowStatus[]).map((k) => <option key={k} value={k}>{O.statuses[k]}</option>)}
                  </select>{tick(r.id, "status")}
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <select className={sel} aria-label={`${O.size} ${r.name}`} value={r.size} onChange={(e) => { const v = e.target.value as "normal" | "bulky"; set(r.id, { size: v }); void save(r, "size", v); }}>
                    <option value="normal">{O.sizes.normal}</option><option value="bulky">{O.sizes.bulky}</option>
                  </select>{tick(r.id, "size")}
                </div>
              </td>
              <td data-label={O.branch} className="min-w-[10rem]">
                <div className="flex items-center gap-1">
                  <select className={sel} aria-label={`${O.branch} ${r.name}`} value={r.branchId} onChange={(e) => { set(r.id, { branchId: e.target.value }); void save(r, "branch_id", e.target.value); }}>
                    <option value="">— {O.branch} —</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>{tick(r.id, "branch_id")}
                </div>
                <div className="mt-1 flex items-center gap-1"><input className="input py-1 text-sm" placeholder={O.notes} aria-label={`${O.notes} ${r.name}`} value={r.notes} maxLength={500} onChange={(e) => set(r.id, { notes: e.target.value })} onBlur={(e) => void save(r, "notes", e.target.value)} />{tick(r.id, "notes")}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <datalist id="order-couriers">{couriers.map((c) => <option key={c} value={c} />)}</datalist>
    </div></div>
  );
}
