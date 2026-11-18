import { describe, expect, it } from "vitest";
import { dropStockDoc, enqueueStockDoc, flushStockQueue, loadStockQueue, type QueuedStockDoc } from "@/lib/offline-stock";

const mk = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) }; };
const doc = (id: string): QueuedStockDoc => ({ clientId: id, createdAt: "2026-11-18T08:00:00Z", label: id, input: { clientId: id, kind: "receipt", locationId: "loc", lines: [{ variantId: "v", qty: "2" }] } });

describe("stock documents saved without internet", () => {
  it("keeps one copy per client id", () => {
    const st = mk();
    enqueueStockDoc(st, doc("a")); enqueueStockDoc(st, doc("a")); enqueueStockDoc(st, doc("b"));
    expect(loadStockQueue(st).map((d) => d.clientId)).toEqual(["a", "b"]);
  });
  it("sends in order, stops while still offline, keeps refusals with their reason", async () => {
    const st = mk();
    for (const id of ["a", "b", "c"]) enqueueStockDoc(st, doc(id));
    const r1 = await flushStockQueue(st, async (d) => (d.clientId === "a" ? { ok: true, docNo: 7 } : { ok: false, error: "network", network: true }));
    expect(r1).toMatchObject({ sent: 1, offline: true, waiting: 2, posted: [{ label: "a", docNo: 7 }] });
    const r2 = await flushStockQueue(st, async (d) => (d.clientId === "b" ? { ok: false, error: "bad_qty" } : { ok: true, docNo: 8 }));
    expect(r2).toMatchObject({ sent: 1, refused: 1, waiting: 1 });
    expect(loadStockQueue(st)[0]).toMatchObject({ clientId: "b", error: "bad_qty" });
    // a refused document is not resent by itself; a person removes it
    const r3 = await flushStockQueue(st, async () => { throw new Error("should not send"); });
    expect(r3.sent + r3.refused).toBe(0);
    dropStockDoc(st, "b");
    expect(loadStockQueue(st)).toEqual([]);
  });
});
