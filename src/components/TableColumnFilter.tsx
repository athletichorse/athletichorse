"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dict } from "@/i18n";

type Op = "starts" | "ends" | "contains" | "eq" | "gt" | "gte" | "lt" | "lte";
const TEXT_OPS: Op[] = ["contains", "starts", "ends", "eq"];
const NUM_OPS: Op[] = ["eq", "gt", "gte", "lt", "lte"];
const SYMBOL: Record<Op, string> = { starts: "a*", ends: "*a", contains: "*a*", eq: "=", gt: ">", gte: "≥", lt: "<", lte: "≤" };
const LATIN = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٫]/g, ".");
const asNumber = (s: string) => { const x = LATIN(s).replace(/[,\s]|SAR|ر\.س/gi, ""); return x !== "" && /^-?\d+(\.\d+)?$/.test(x) ? Number(x) : null; };
/** What a cell holds: an input's value (count sheets) or its text. */
const cellText = (td: Element | undefined) => {
  if (!td) return "";
  const inp = td.querySelector("input, select") as HTMLInputElement | HTMLSelectElement | null;
  // textContent: the real text, not how it is drawn (headers and badges may be shown in capitals)
  return (inp ? inp.value : td.textContent ?? "").replace(/\s+/g, " ").trim();
};
function match(cell: string, op: Op, v: string): boolean {
  const n = asNumber(cell), x = asNumber(v);
  if (NUM_OPS.includes(op) && op !== "eq") {
    if (n === null || x === null) return false;
    return op === "gt" ? n > x : op === "gte" ? n >= x : op === "lt" ? n < x : n <= x;
  }
  const h = LATIN(cell).toLowerCase(), q = LATIN(v).toLowerCase();
  if (op === "eq") return n !== null && x !== null ? n === x : h === q;
  if (op === "starts") return h.startsWith(q);
  if (op === "ends") return h.endsWith(q);
  return h.includes(q);
}

/**
 * Search by columns for any list table: a filter (match type + value) over each column; rows
 * that don't match every filled filter are hidden. Text: a*, *a, *a*, =; numbers: = > ≥ < ≤.
 * Filters what is on this page.
 */
export function TableColumnFilter({ t, children, note }: { t: Dict; children: React.ReactNode; note?: string }) {
  const C = t.pos.colSearch;
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [cols, setCols] = useState<{ i: number; label: string; numeric: boolean }[]>([]);
  const [f, setF] = useState<Record<number, { op: Op; v: string }>>({});
  const [shown, setShown] = useState<{ n: number; of: number } | null>(null);

  const rows = useCallback(() => [...(box.current?.querySelectorAll("table tbody tr") ?? [])].filter((r) => r.querySelectorAll("td").length > 1) as HTMLTableRowElement[], []);
  // the table's columns (header text) and which ones hold numbers
  useEffect(() => {
    if (!open) return;
    const ths = [...(box.current?.querySelectorAll("table thead th") ?? [])];
    const rs = rows();
    const next = ths.map((th, i) => {
      const vals = rs.map((r) => cellText(r.querySelectorAll("td")[i])).filter((x) => x && x !== "—");
      return { i, label: (th.textContent ?? "").replace(/[▲▼]/g, "").replace(/\s+/g, " ").trim(), numeric: vals.length > 0 && vals.every((x) => asNumber(x) !== null) };
    }).filter((c) => c.label);
    queueMicrotask(() => setCols(next)); // read from the page after it is drawn
  }, [open, rows]);

  const apply = useCallback(() => {
    const active = Object.entries(f).filter(([, x]) => x.v.trim());
    const rs = rows();
    let n = 0;
    for (const r of rs) {
      const tds = r.querySelectorAll("td");
      const ok = active.every(([i, x]) => match(cellText(tds[Number(i)]), x.op, x.v.trim()));
      r.style.display = ok ? "" : "none";
      if (ok) n++;
    }
    setShown(active.length ? { n, of: rs.length } : null);
  }, [f, rows]);
  useEffect(() => { queueMicrotask(apply); }, [apply]);
  // rows that change (typing in a count sheet, sorting) are filtered again
  useEffect(() => {
    const body = box.current?.querySelector("table tbody");
    if (!body || !Object.values(f).some((x) => x.v.trim())) return;
    const mo = new MutationObserver(() => apply());
    mo.observe(body, { childList: true });
    return () => mo.disconnect();
  }, [apply, f]);
  const clear = () => { setF({}); for (const r of rows()) r.style.display = ""; };

  return (
    <div ref={box}>
      <div className="no-print mb-2 flex flex-wrap items-center gap-2">
        <button type="button" className={`btn-ghost ${open ? "border-[var(--brand)] text-[var(--brand)]" : ""}`} aria-expanded={open} data-testid="column-filter-open"
          onClick={() => { if (open) clear(); setOpen(!open); }}>▦ {C.open}</button>
        {shown && <span className="text-sm text-gray-600" data-testid="column-filter-count">{C.showing.replace("{n}", String(shown.n)).replace("{total}", String(shown.of))}</span>}
        {note && open && <span className="hint">{note}</span>}
      </div>
      {open && (
        <div className="no-print card mb-3 grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="column-filter">
          {cols.map((c) => {
            const cur = f[c.i] ?? { op: c.numeric ? "eq" : "contains", v: "" };
            return (
              <div key={c.i}>
                <div className="mb-1 text-xs font-medium text-gray-600">{c.label}</div>
                <div className="flex">
                  <select aria-label={`${c.label} · ${C.match}`} value={cur.op} onChange={(e) => setF({ ...f, [c.i]: { ...cur, op: e.target.value as Op } })}
                    className="rounded-s-lg border border-e-0 border-[var(--line)] bg-[var(--brand-soft)] px-1.5 text-sm font-semibold text-[var(--brand)]" dir="ltr" title={C.ops[cur.op]}>
                    {(c.numeric ? NUM_OPS : TEXT_OPS).map((o) => <option key={o} value={o} title={C.ops[o]}>{SYMBOL[o]}</option>)}
                  </select>
                  <input aria-label={c.label} className="input min-w-0 rounded-s-none py-1.5" value={cur.v} inputMode={c.numeric ? "decimal" : undefined}
                    onChange={(e) => setF({ ...f, [c.i]: { ...cur, v: e.target.value } })} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {children}
    </div>
  );
}
