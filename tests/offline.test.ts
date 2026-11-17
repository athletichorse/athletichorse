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

describe("device screen", () => {
  it("remembers which cashier screen this device opens on, and ignores junk", async () => {
    const { getDeviceScreen, setDeviceScreen } = await import("@/lib/offline");
    const st = memStore();
    expect(getDeviceScreen(st)).toBeNull();
    setDeviceScreen(st, "desk");
    expect(getDeviceScreen(st)).toBe("desk");
    st.set("pos-device-screen", "admin");
    expect(getDeviceScreen(st)).toBeNull();
    setDeviceScreen(st, null);
    expect(st.data.has("pos-device-screen")).toBe(false);
  });
});

import { decodeQuoteQr, encodeQuoteQr, enqueueOp, flushOps, loadOps, nextConn, nextQuoteTempNo, searchCustomersLocal, type QueuedOp } from "@/lib/offline";
import { normalizeSaudiMobile } from "@/lib/saudi";

describe("offline everywhere", () => {
  const mem = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) }; };
  it("connection: offline after two failed pings, back online on the first good one", () => {
    let s = { online: true, fails: 0, since: 0 };
    s = nextConn(s, false, 1); expect(s.online).toBe(true);
    s = nextConn(s, false, 2); expect(s).toEqual({ online: false, fails: 2, since: 2 });
    s = nextConn(s, false, 3); expect(s.since).toBe(2);
    s = nextConn(s, true, 4); expect(s).toEqual({ online: true, fails: 0, since: 4 });
  });
  it("customers copy: mobile, customer no., then name", () => {
    const items = [{ i: "a", no: 7, n: "Sara Ali", p: "+966501234567", d: 0 }, { i: "b", no: 8, n: "Ali Omar", p: "+966551112222", d: 10 }];
    expect(searchCustomersLocal(items, "0501234567", normalizeSaudiMobile).map((c) => c.i)).toEqual(["a"]);
    expect(searchCustomersLocal(items, "8", normalizeSaudiMobile).map((c) => c.i)).toEqual(["b"]);
    expect(searchCustomersLocal(items, "ali", normalizeSaudiMobile).map((c) => c.i)).toEqual(["a", "b"]);
    expect(searchCustomersLocal(items, "", normalizeSaudiMobile)).toEqual([]);
  });
  it("drawer entries and quotations wait, are sent once, and refusals stay", async () => {
    const st = mem();
    const op = (id: string): QueuedOp => ({ kind: "drawer", clientId: id, shiftId: "s", createdAt: "", label: "", payload: { kind: "expense", amount: "5", reason: "" } });
    enqueueOp(st, op("1")); enqueueOp(st, op("1")); enqueueOp(st, op("2")); enqueueOp(st, op("3"));
    expect(loadOps(st)).toHaveLength(3);
    const r = await flushOps(st, async (o) => (o.clientId === "2" ? { ok: false, error: "bad" } : o.clientId === "3" ? { ok: false, error: "network", network: true } : { ok: true }));
    expect(r).toEqual({ sent: 1, refused: 1, offline: true, waiting: 2 });
    expect(loadOps(st).find((x) => x.clientId === "2")?.error).toBe("bad");
    expect(nextQuoteTempNo(st, "BR01")).toMatch(/^OFF-BR01-[A-Z0-9]{4}-Q0001$/);
  });
  it("desk QR carries the quotation and rejects anything else", () => {
    const lines = [{ variantId: "11111111-2222-4333-8444-555555555555", qty: "2", unitPrice: "7.00", discount: "0.50" }];
    const text = encodeQuoteQr("OFF-BR01-AB12-Q0001", lines);
    expect(decodeQuoteQr(text)).toEqual({ no: "OFF-BR01-AB12-Q0001", lines });
    expect(decodeQuoteQr("100025")).toBeNull();
    expect(decodeQuoteQr("AHQ1|1|bad,1,1,0")).toBeNull();
    expect(decodeQuoteQr(text.replace(",2,", ",0,"))).toBeNull();
  });
});

import { findInvoiceLocal, loadInvoices, nextReturnTempNo, noReceiptAmount, returnLineAmount, saveInvoices, sumAmounts, takeReturned, type RecentInvoice } from "@/lib/offline";

describe("returns without internet", () => {
  const mk = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) }; };
  const inv: RecentInvoice = { i: "inv-1", n: "BR01-000007", o: "OFF-BR01-AB12-0003", t: "2026-11-10T10:00:00Z", c: null,
    l: [[1, "Rope", "100100", "3", "3", "100.00"], [2, "Bit", "200200", "1", "1", "45.50"]] };

  it("refund is the line total × returned / sold, rounded to the halala like the server", () => {
    expect(returnLineAmount(inv.l[0], "1")).toBe("33.33");
    expect(returnLineAmount(inv.l[0], "2")).toBe("66.67");
    expect(returnLineAmount(inv.l[0], "3")).toBe("100.00");
    expect(returnLineAmount(inv.l[1], "1")).toBe("45.50");
    expect(sumAmounts(["33.33", "45.50"])).toBe("78.83");
  });
  it("can't return more than is left, or zero", () => {
    expect(returnLineAmount(inv.l[0], "4")).toBeNull();
    expect(returnLineAmount(inv.l[0], "0")).toBeNull();
    expect(returnLineAmount(inv.l[0], "abc")).toBeNull();
  });
  it("no receipt: shelf price × quantity", () => {
    expect(noReceiptAmount("35.00", "2")).toBe("70.00");
    expect(noReceiptAmount("10.00", "0.333")).toBe("3.33");
    expect(noReceiptAmount("10.00", "0")).toBeNull();
  });
  it("finds a receipt by its number or its temporary number; returned quantities come off", () => {
    const st = mk();
    saveInvoices(st, "loc-1", [inv]);
    expect(findInvoiceLocal(st, "br01-000007")?.i).toBe("inv-1");
    expect(findInvoiceLocal(st, "OFF-BR01-AB12-0003")?.i).toBe("inv-1");
    expect(findInvoiceLocal(st, "BR01-999999")).toBeNull();
    takeReturned(st, "inv-1", [{ lineNo: 1, qty: "2" }]);
    expect(loadInvoices(st)!.items[0].l[0][4]).toBe("1");
    expect(returnLineAmount(loadInvoices(st)!.items[0].l[0], "2")).toBeNull();
  });
  it("a fresh copy from the server still counts returns waiting on this device", () => {
    const st = mk();
    enqueueOp(st, { kind: "return", clientId: "c1", shiftId: "s1", createdAt: "x", label: "", tempNo: "OFF-BR01-AB12-R0001", total: "33.33",
      payload: { locationId: "loc-1", originalInvoiceId: "inv-1", reason: "", refundMethod: "cash", lines: [{ lineNo: 1, qty: "1" }] }, slip: { original: null, lines: [] } });
    saveInvoices(st, "loc-1", [inv]);
    expect(loadInvoices(st)!.items[0].l[0][4]).toBe("2");
  });
  it("temporary return numbers have their own counter", () => {
    const st = mk();
    st.set("pos-device-id", "AB12");
    expect(nextReturnTempNo(st, "BR01")).toBe("OFF-BR01-AB12-R0001");
    expect(nextReturnTempNo(st, "BR01")).toBe("OFF-BR01-AB12-R0002");
  });
});
