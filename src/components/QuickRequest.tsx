"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict } from "@/i18n";
import { createRequestAction } from "@/app/actions/stock";

type Store = { id: string; name: string; code: string };
type Item = { variantId: string; sku: string | null; name: string; options: string; price: string; stock: Record<string, number> };
type Pick = { variantId: string; name: string; from: string; qty: string };

/** Click a store's stock to add the item, requested from that store; one request per sender. */
export function QuickRequest({ t, stores, mine, items }: { t: Dict; stores: Store[]; mine: Store[]; items: Item[] }) {
  const F = t.stock.flow;
  const router = useRouter();
  const [to, setTo] = useState(mine[0]?.id ?? "");
  const [cart, setCart] = useState<Pick[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sname = (id: string) => stores.find((s) => s.id === id)?.name ?? id;
  const add = (it: Item, from: string) => setCart((c) => c.some((x) => x.variantId === it.variantId && x.from === from)
    ? c.map((x) => (x.variantId === it.variantId && x.from === from ? { ...x, qty: String(Number(x.qty) + 1) } : x))
    : [...c, { variantId: it.variantId, name: `${it.name}${it.options ? ` · ${it.options}` : ""}`, from, qty: "1" }]);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <section className="card overflow-hidden p-0"><div className="max-h-[70vh] overflow-auto">
        <table className="table" data-export>
          <thead className="sticky top-0 z-10"><tr><th>{t.stock.item}</th><th>SKU</th><th>{F.price}</th>{stores.map((s) => <th key={s.id} title={s.name}>{s.code}</th>)}</tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={3 + stores.length} className="py-10 text-center text-gray-500">{t.stock.notFound}</td></tr>}
            {items.map((it) => (
              <tr key={it.variantId}>
                <td className="cell-title">{it.name}{it.options && <div className="text-xs text-gray-500">{it.options}</div>}</td>
                <td data-label="SKU" className="font-mono text-xs" dir="ltr">{it.sku ?? "—"}</td>
                <td data-label={F.price} dir="ltr">{Number(it.price).toFixed(2)}</td>
                {stores.map((s) => {
                  const n = it.stock[s.id] ?? 0;
                  return (
                    <td key={s.id} data-label={s.name}>
                      <button type="button" disabled={s.id === to || n <= 0} onClick={() => add(it, s.id)}
                        className={`min-w-10 rounded-md px-2 py-1 text-sm ${s.id === to ? "text-gray-400" : n > 0 ? "bg-[var(--brand-soft)] font-semibold text-[var(--brand)] hover:brightness-95" : "text-gray-300"}`}>{n}</button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div></section>
      <aside className="card space-y-3 self-start">
        <div><label className="label">{F.forStore}</label><select className="input" value={to} onChange={(e) => { setTo(e.target.value); setCart((c) => c.filter((x) => x.from !== e.target.value)); }}>{mine.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <h3 className="text-sm font-semibold text-gray-700">{F.cart} ({cart.length})</h3>
        {cart.map((c, i) => (
          <div key={`${c.variantId}-${c.from}`} className="flex items-center gap-2 text-sm">
            <div className="min-w-0 flex-1"><div className="truncate">{c.name}</div><div className="text-xs text-gray-500">{F.from}: {sname(c.from)}</div></div>
            <input className="input w-16" dir="ltr" inputMode="decimal" value={c.qty} onChange={(e) => setCart((cs) => cs.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
            <button type="button" className="text-red-600" onClick={() => setCart((cs) => cs.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        {msg && <p className={msg.ok ? "alert-ok" : "alert-err"}>{msg.text}</p>}
        <button className="btn-primary w-full" disabled={busy || !cart.length || !to} onClick={async () => {
          setBusy(true); setMsg(null);
          const senders = [...new Set(cart.map((c) => c.from))];
          const nos: number[] = [];
          for (const from of senders) {
            const r = await createRequestAction({ clientId: crypto.randomUUID(), toLocationId: to, fromLocationId: from, lines: cart.filter((c) => c.from === from).map((c) => ({ variantId: c.variantId, qty: c.qty })) });
            if (!r.ok) { setBusy(false); return setMsg({ ok: false, text: (t.stock.errors as Record<string, string>)[r.error] ?? r.error }); }
            nos.push(r.requestNo);
          }
          setBusy(false); setCart([]); setMsg({ ok: true, text: `${F.requestSent} ${nos.join(", ")}` }); router.refresh();
        }}>{F.sendRequests}</button>
      </aside>
    </div>
  );
}
