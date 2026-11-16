"use client";

import type { Dict, Locale } from "@/i18n";
import { formatDateTime } from "@/lib/time";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { encodeQuoteQr, type QrLine, type QueuedSale } from "@/lib/offline";
import type { OfflineTill } from "./useOfflineTill";

/** Status of the offline till on this device: connection, price list, sales waiting to be sent. */
export function OfflineBar({ t, locale, off, canManage, err, screens }: { t: Dict; locale: Locale; off: OfflineTill; canManage: boolean; err: (c: string) => string; screens: { key: "sell" | "desk" | "collect"; label: string }[] }) {
  const o = t.pos.offline;
  const refused = [...off.queue.filter((x) => x.error).map((x) => ({ id: x.clientId, no: x.tempNo, total: x.total, error: x.error })),
    ...off.ops.filter((x) => x.error).map((x) => ({ id: x.clientId, no: x.kind === "quote" ? x.tempNo : "", total: x.label, error: x.error }))];
  const waiting = off.queue.length + off.ops.length;
  // seconds without a connection (the switch to offline is automatic)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (off.online) return; const id = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(id); }, [off.online]);
  if (!off.enabled && off.online && !waiting && !canManage) return null;
  return (
    <section className={`card space-y-3 p-4 ${off.online ? "" : "border-amber-300 bg-amber-50"}`} data-testid="offline-bar">
      <div className="flex flex-wrap items-center gap-3">
        <span className={off.online ? "badge-green" : "badge bg-amber-100 text-amber-800"} data-testid="conn">{off.online ? o.online : o.offline}</span>
        {!off.online && off.offlineSince && <span className="text-xs text-amber-800">{o.offlineFor} {Math.max(0, Math.round((now - off.offlineSince) / 1000))}{o.seconds}</span>}
        {waiting > 0 && (
          <span className="badge bg-amber-100 text-amber-800">{o.waiting}: {waiting}</span>
        )}
        <div className="flex-1" />
        {waiting > 0 && off.online && (
          <button className="btn-ghost" disabled={off.busy === "send"} onClick={() => void off.flush()}>{off.busy === "send" ? o.sending : o.sendNow}</button>
        )}
        {off.enabled && off.online && (
          <button className="btn-ghost" disabled={off.busy === "catalog"} onClick={() => void off.refreshCatalog()}>{off.busy === "catalog" ? o.sending : o.updatePriceList}</button>
        )}
      </div>

      {canManage && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={off.enabled} onChange={(e) => off.setEnabled(e.target.checked)} />
          <span><span className="font-medium">{o.enable}</span><span className="hint block">{o.enableHint}</span></span>
        </label>
      )}

      {canManage && screens.length > 1 && (
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{o.deviceScreen}</span>
          <select className="input w-auto" value={off.screen ?? ""} onChange={(e) => off.setScreen((e.target.value || null) as "sell" | "desk" | "collect" | null)}>
            <option value="">{o.screenDefault}</option>
            {screens.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
      )}

      {off.enabled && (
        <p className="text-xs text-gray-500">
          {off.catalogInfo ? `${o.priceList}: ${off.catalogInfo.count} ${o.items} · ${formatDateTime(new Date(off.catalogInfo.savedAt), locale)}` : o.noPriceList}
        </p>
      )}

      {refused.length > 0 && (
        <ul className="space-y-1 text-sm text-red-700">
          {refused.map((x) => <li key={x.id} dir="auto"><span dir="ltr">{x.no}</span> · {x.total} · {o.refused}: {err(x.error ?? "")}</li>)}
        </ul>
      )}

      {off.sent.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-600">{o.lastSent} ({off.sent.length})</summary>
          <ul className="mt-2 space-y-1">
            {off.sent.slice(0, 10).map((x) => (
              <li key={x.tempNo} className="flex flex-wrap gap-2" dir="ltr">
                <span className="text-gray-500">{x.tempNo}</span> → <a className="font-medium underline" href={`/sales/${x.invoiceId}?print=1`} target="_blank" rel="noopener">{x.number}</a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Prints an 80 mm temporary receipt for an offline sale (works without internet). */
export function printTempReceipt(sale: QueuedSale, ctx: { t: Dict; locale: Locale; company: string; branch: string }) {
  const o = ctx.t.pos.offline;
  const dir = ctx.locale === "ar" ? "rtl" : "ltr";
  const rows = sale.lines.map((l) => `<tr><td>${esc(l.name)}</td><td class="n">${esc(l.qty)}</td><td class="n">${esc(l.price)}</td></tr>${Number(l.discount) > 0 ? `<tr><td colspan="3" class="d">− ${esc(l.discount)}</td></tr>` : ""}`).join("");
  const html = `<!doctype html><html lang="${ctx.locale}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(sale.tempNo)}</title>
<style>@page{margin:4mm}body{font:12px system-ui,sans-serif;width:72mm;margin:0 auto}h1{font-size:14px;text-align:center;margin:4px 0}
.c{text-align:center}table{width:100%;border-collapse:collapse}td{padding:2px 0;vertical-align:top}.n{text-align:end;white-space:nowrap;padding-inline-start:6px}
.d{color:#555;font-size:11px}.t{border-top:1px dashed #000;margin-top:6px;padding-top:6px;font-weight:700;display:flex;justify-content:space-between}
.note{border:1px solid #000;padding:4px;margin-top:8px;font-size:11px}</style></head><body>
<div class="c"><img src="${location.origin}/brand/logo.png" alt="" style="height:40px"></div><h1>${esc(ctx.company)}</h1><div class="c">${esc(ctx.branch)}</div>
<div class="c" style="margin:6px 0;font-weight:700">${esc(o.tempReceipt)}</div>
<div class="c" dir="ltr">${esc(sale.tempNo)}</div><div class="c">${esc(formatDateTime(new Date(sale.createdAt), ctx.locale))}</div>
<table style="margin-top:6px">${rows}</table>
<div class="t"><span>${esc(ctx.t.pos.total)}</span><span dir="ltr">${esc(sale.total)} SAR</span></div>
<div class="note">${esc(o.tempNote)}</div>
<script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/** Prints the desk slip of a quotation made offline; its QR carries the items so the cashier can scan it offline too. */
export async function printTempQuote(q: { tempNo: string; total: string; createdAt: string; cart: QrLine[]; lines: { name: string; qty: string; price: string; discount: string }[] }, ctx: { t: Dict; locale: Locale; company: string; branch: string }) {
  const o = ctx.t.pos.offline;
  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) return;
  let qr = "";
  try { qr = await QRCode.toDataURL(encodeQuoteQr(q.tempNo, q.cart), { margin: 1, width: 220, errorCorrectionLevel: "L" }); } catch { /* too many lines for one QR: the number still works online */ }
  const dir = ctx.locale === "ar" ? "rtl" : "ltr";
  const rows = q.lines.map((l) => `<tr><td>${esc(l.name)}</td><td class="n">${esc(l.qty)}</td><td class="n">${esc(l.price)}</td></tr>${Number(l.discount) > 0 ? `<tr><td colspan="3" class="d">− ${esc(l.discount)}</td></tr>` : ""}`).join("");
  w.document.open();
  w.document.write(`<!doctype html><html lang="${ctx.locale}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(q.tempNo)}</title>
<style>@page{margin:4mm}body{font:12px system-ui,sans-serif;width:72mm;margin:0 auto}h1{font-size:14px;text-align:center;margin:4px 0}
.c{text-align:center}table{width:100%;border-collapse:collapse}td{padding:2px 0;vertical-align:top}.n{text-align:end;white-space:nowrap;padding-inline-start:6px}
.d{color:#555;font-size:11px}.t{border-top:1px dashed #000;margin-top:6px;padding-top:6px;font-weight:700;display:flex;justify-content:space-between}
.note{border:1px solid #000;padding:4px;margin-top:8px;font-size:11px}</style></head><body>
<div class="c"><img src="${location.origin}/brand/logo.png" alt="" style="height:40px"></div><h1>${esc(ctx.company)}</h1><div class="c">${esc(ctx.branch)}</div>
<div class="c" style="margin:6px 0;font-weight:700">${esc(o.quoteSlip)}</div>
<div class="c" dir="ltr">${esc(q.tempNo)}</div><div class="c">${esc(formatDateTime(new Date(q.createdAt), ctx.locale))}</div>
<table style="margin-top:6px">${rows}</table>
<div class="t"><span>${esc(ctx.t.pos.total)}</span><span dir="ltr">${esc(q.total)} SAR</span></div>
${qr ? `<div class="c" style="margin-top:8px"><img src="${qr}" alt="" style="width:46mm;height:46mm"></div>` : ""}
<div class="note">${esc(o.quoteSlipNote)}</div>
<script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}
