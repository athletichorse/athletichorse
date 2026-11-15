import { describe, expect, it } from "vitest";
import {
  deviceId, enqueue, flushQueue, loadQueue, loadSent, makeTempNo, nextTempNo, pendingForShift, searchCatalog,
  type CatalogItem, type QueuedSale, type Store,
} from "@/lib/offline";

function memStore(): Store & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), remove: (k) => void data.delete(k) };
}

const sale = (id: string, shift = "s1"): QueuedSale => ({
  clientId: id, tempNo: `T-${id}`, createdAt: "2026-11-15T10:00:00Z", locationId: "l1", shiftId: shift, total: "35.00",
  payload: { lines: [{ variantId: "v1", qty: "1", unitPrice: "35.00", discount: "0" }], payments: [{ method: "cash", amount: "35.00" }] },
  lines: [{ name: "Shirt", qty: "1", price: "35.00", discount: "0" }],
});

describe("temporary numbers", () => {
  it("formats branch, device and a 4-digit sequence", () => {
    expect(makeTempNo("BR01", "7K2Q", 3)).toBe("OFF-BR01-7K2Q-0003");
  });
  it("keeps one device id and counts up, never reusing a number", () => {
    const st = memStore();
    const id = deviceId(st, () => "ab12cd34-xxxx");
    expect(id).toBe("AB12");
    expect(deviceId(st, () => "zzzzzzzz")).toBe("AB12");
    expect(nextTempNo(st, "BR02")).toBe("OFF-BR02-AB12-0001");
    expect(nextTempNo(st, "BR02")).toBe("OFF-BR02-AB12-0002");
  });
});

describe("offline price list search", () => {
  const items: CatalogItem[] = [
    { v: "1", n: "Riding boots", o: "Black / 42", s: "RB-42", c: ["6281000000012"], p: "350.00", x: false },
    { v: "2", n: "Riding gloves", o: "M", s: "RG-M", c: [], p: "80.00", x: false },
    { v: "3", n: "Saddle pad", o: "", s: null, c: [], p: "120.00", x: false },
  ];
  it("finds an exact barcode or extra code first", () => {
    expect(searchCatalog(items, "RB-42")).toEqual([{ item: items[0], exact: true }]);
    expect(searchCatalog(items, "6281000000012")).toEqual([{ item: items[0], exact: true }]);
  });
  it("matches every word of a name search, any case", () => {
    expect(searchCatalog(items, "riding").map((h) => h.item.v)).toEqual(["1", "2"]);
    expect(searchCatalog(items, "RIDING m").map((h) => h.item.v)).toEqual(["2"]);
    expect(searchCatalog(items, "  ")).toEqual([]);
  });
});

describe("offline queue", () => {
  it("never queues the same sale twice", () => {
    const st = memStore();
    enqueue(st, sale("a"));
    enqueue(st, sale("a"));
    expect(loadQueue(st)).toHaveLength(1);
  });

  it("sends in order, records the real invoice number and empties the queue", async () => {
    const st = memStore();
    enqueue(st, sale("a"));
    enqueue(st, sale("b"));
    const sentIds: string[] = [];
    const r = await flushQueue(st, async (s) => { sentIds.push(s.clientId); return { ok: true, invoiceId: `inv-${s.clientId}`, number: `BR01-00000${sentIds.length}` }; }, () => "now");
    expect(sentIds).toEqual(["a", "b"]);
    expect(r).toEqual({ sent: 2, refused: 0, offline: false, waiting: 0 });
    expect(loadSent(st).map((x) => [x.tempNo, x.number])).toEqual([["T-b", "BR01-000002"], ["T-a", "BR01-000001"]]);
  });

  it("stops at a network failure and keeps everything for the next try", async () => {
    const st = memStore();
    enqueue(st, sale("a"));
    enqueue(st, sale("b"));
    const r = await flushQueue(st, async () => { throw new TypeError("Failed to fetch"); });
    expect(r).toEqual({ sent: 0, refused: 0, offline: true, waiting: 2 });
  });

  it("keeps a refused sale with its error and carries on with the rest", async () => {
    const st = memStore();
    enqueue(st, sale("a"));
    enqueue(st, sale("b", "s2"));
    const r = await flushQueue(st, async (s) => (s.clientId === "a" ? { ok: false, error: "item_not_for_sale" } : { ok: true, invoiceId: "i", number: "BR01-000009" }));
    expect(r).toEqual({ sent: 1, refused: 1, offline: false, waiting: 1 });
    expect(loadQueue(st)[0]).toMatchObject({ clientId: "a", error: "item_not_for_sale" });
    expect(pendingForShift(st, "s1")).toHaveLength(1);
    expect(pendingForShift(st, "s2")).toHaveLength(0);
  });
});
