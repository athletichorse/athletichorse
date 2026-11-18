/**
 * Stock documents made without internet (receipts, transfers, counts, write-offs).
 * Saved on the device with their client id; sent in order when the connection is back.
 * The server posts each client id at most once, so a retry can never post a document twice.
 */
import type { StockDocInput } from "@/app/actions/stock";
import type { Store } from "./offline";

export type QueuedStockDoc = {
  clientId: string;
  createdAt: string;
  label: string;          // e.g. "Receipt · 3 items"
  input: Omit<StockDocInput, "approverUsername" | "approverPin">;
  error?: string;         // last refusal from the server (not a network error)
};

const KS = "stock-offline-queue-v1";
const read = (st: Store): QueuedStockDoc[] => { try { return JSON.parse(st.get(KS) || "[]") as QueuedStockDoc[]; } catch { return []; } };
const write = (st: Store, q: QueuedStockDoc[]) => (q.length ? st.set(KS, JSON.stringify(q)) : st.remove(KS));

export const loadStockQueue = read;
export function enqueueStockDoc(st: Store, d: QueuedStockDoc) {
  const q = read(st);
  if (!q.some((x) => x.clientId === d.clientId)) write(st, [...q, d]);
}
/** Drop a refused document (a manager decided not to keep it). */
export const dropStockDoc = (st: Store, clientId: string) => write(st, read(st).filter((x) => x.clientId !== clientId));

export type StockSend = { ok: true; docNo: number } | { ok: false; error: string; network?: boolean };
/** In order; stops at the first network failure; a refusal stays with its error. */
export async function flushStockQueue(st: Store, send: (d: QueuedStockDoc) => Promise<StockSend>) {
  let sent = 0, refused = 0, offline = false;
  const posted: { label: string; docNo: number }[] = [];
  for (const d of read(st)) {
    if (d.error) continue; // refused before: waits for a person
    let r: StockSend;
    try { r = await send(d); } catch { r = { ok: false, error: "network", network: true }; }
    if (!r.ok && r.network) { offline = true; break; }
    if (r.ok) { write(st, read(st).filter((x) => x.clientId !== d.clientId)); sent++; posted.push({ label: d.label, docNo: r.docNo }); }
    else { write(st, read(st).map((x) => (x.clientId === d.clientId ? { ...x, error: r.error } : x))); refused++; }
  }
  return { sent, refused, offline, posted, waiting: read(st).length };
}
