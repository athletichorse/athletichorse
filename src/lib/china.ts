/**
 * China (container) orders: the same landed-cost rule as the database (save_china_order),
 * for the live preview, and reading the supplier's sheet.
 */
export const CN_CONTAINERS = [
  { key: "20ft", cbm: 28 },
  { key: "40ft", cbm: 58 },
  { key: "40hc", cbm: 68 },
] as const;
export type ContainerKey = (typeof CN_CONTAINERS)[number]["key"];

export type CnLine = { supplier_code: string; description: string; variant_id: string | null; cartons: string; per_carton: string; unit_price: string; carton_cbm: string; image_url?: string | null; sku?: string | null };
export type CnFees = { rate: string; rate_paid: string; fee_shipping: string; fee_customs: string; fee_other: string };

const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[,\s]/g, "")); return Number.isFinite(n) ? n : 0; };

/** Per line: pieces, CNY value, CBM, landed cost per piece and per line (SAR); and the order totals. */
export function landed(lines: CnLine[], f: CnFees) {
  const rate = num(f.rate), paid = num(f.rate_paid), eff = paid > 0 ? paid : rate;
  const ship = num(f.fee_shipping), cust = num(f.fee_customs), other = num(f.fee_other);
  const rows = lines.map((l) => {
    const cartons = num(l.cartons), per = Math.max(1, num(l.per_carton) || 1);
    const qty = cartons * per, cny = qty * num(l.unit_price), cbm = cartons * num(l.carton_cbm);
    return { qty, cny, cbm };
  });
  const totCny = rows.reduce((a, r) => a + r.cny, 0), totCbm = rows.reduce((a, r) => a + r.cbm, 0);
  const out = rows.map((r) => {
    if (r.qty <= 0) return { ...r, unit: null as number | null, line: 0, feesShare: 0 };
    const shipShare = totCbm > 0 ? (ship * r.cbm) / totCbm : totCny > 0 ? (ship * r.cny) / totCny : 0;
    const restShare = totCny > 0 ? ((cust + other) * r.cny) / totCny : 0;
    const line = r.cny * eff + shipShare + restShare;
    return { ...r, unit: Math.round((line / r.qty) * 10000) / 10000, line: Math.round(line * 100) / 100, feesShare: Math.round((shipShare + restShare) * 100) / 100 };
  });
  const goodsSar = Math.round(totCny * eff * 100) / 100, fees = Math.round((ship + cust + other) * 100) / 100;
  const pieces = rows.reduce((a, r) => a + r.qty, 0);
  return {
    rows: out, totCny: Math.round(totCny * 100) / 100, totCbm: Math.round(totCbm * 1000) / 1000, goodsSar, fees,
    feePct: goodsSar > 0 ? Math.round((fees / goodsSar) * 1000) / 10 : 0,
    // what changes because the rate actually paid differs from the order rate
    rateDiff: paid > 0 && rate > 0 ? Math.round(totCny * (paid - rate) * 100) / 100 : null,
    total: Math.round((goodsSar + fees) * 100) / 100, pieces, avgUnit: pieces > 0 ? Math.round(((goodsSar + fees) / pieces) * 100) / 100 : null,
  };
}

// ---------------------------------------------------------------- supplier sheet
const H = {
  code: ["item no", "item code", "code", "model", "sku", "货号", "款号", "型号", "编号", "الكود", "كود", "رقم الصنف"],
  desc: ["description", "desc", "product name", "name", "品名", "名称", "描述", "产品", "الوصف", "اسم", "البيان"],
  per: ["pcs/ctn", "qty/ctn", "pcs per carton", "per carton", "pcs/carton", "装箱数", "每箱", "装箱量", "قطعة/كرتونة", "القطع في الكرتونة", "عدد القطع بالكرتونة"],
  cartons: ["ctns", "cartons", "carton qty", "ctn", "箱数", "件数", "الكراتين", "كراتين", "عدد الكراتين"],
  qty: ["total qty", "quantity", "qty", "pcs", "数量", "总数", "الكمية"],
  price: ["unit price", "price", "单价", "价格", "سعر الوحدة", "السعر"],
  cbm: ["total cbm", "总体积", "cbm", "volume", "体积", "立方", "الحجم", "cbm/ctn"],
} as const;
type Col = keyof typeof H;
const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** Reads the supplier's sheet: finds the header row, then one line per row with a code or description. */
export function readChinaSheet(rows: unknown[][]): { lines: CnLine[]; found: Partial<Record<Col, boolean>>; totalCbm: boolean } {
  let head = -1; let map: Partial<Record<Col, number>> = {}; let totalCbm = false;
  for (let i = 0; i < Math.min(rows.length, 20) && head < 0; i++) {
    const cells = (rows[i] ?? []).map(norm);
    const m: Partial<Record<Col, number>> = {};
    const used = new Set<number>();
    for (const col of ["per", "cartons", "qty", "price", "cbm", "code", "desc"] as Col[]) {
      const j = cells.findIndex((c, k) => !used.has(k) && c && H[col].some((h) => c === h || c.includes(h)));
      if (j >= 0) { m[col] = j; used.add(j); }
    }
    if (Object.keys(m).length >= 3 && (m.price !== undefined || m.cartons !== undefined)) {
      head = i; map = m;
      totalCbm = m.cbm !== undefined && /total|总/.test(cells[m.cbm]);
    }
  }
  if (head < 0) return { lines: [], found: {}, totalCbm: false };
  const at = (r: unknown[], c: Col) => (map[c] === undefined ? "" : String(r[map[c]!] ?? "").trim());
  const lines: CnLine[] = [];
  for (const r of rows.slice(head + 1)) {
    const code = at(r, "code"), desc = at(r, "desc");
    if (!code && !desc) continue;
    if (/^(total|合计|总计|الإجمالي)/i.test(code || desc)) continue;
    let cartons = num(at(r, "cartons")); const per = num(at(r, "per")) || 0; const qty = num(at(r, "qty"));
    if (!cartons && qty && per) cartons = Math.ceil(qty / per);
    let cbm = num(at(r, "cbm"));
    if (totalCbm && cartons > 0) cbm = Math.round((cbm / cartons) * 10000) / 10000;
    lines.push({ supplier_code: code.slice(0, 60), description: desc.slice(0, 300), variant_id: null, cartons: cartons ? String(cartons) : "", per_carton: per ? String(per) : (qty && !cartons ? String(qty) : "1"), unit_price: at(r, "price") ? String(num(at(r, "price"))) : "", carton_cbm: cbm ? String(cbm) : "" });
  }
  return { lines, found: Object.fromEntries(Object.keys(map).map((k) => [k, true])), totalCbm };
}

/** A simple CSV/TSV reader for supplier sheets saved as text (quotes allowed). */
export function parseCsvRows(text: string): string[][] {
  const sep = text.includes("\t") && !text.includes(",") ? "\t" : ",";
  return text.split(/\r?\n/).filter((l) => l.trim()).map((line) => {
    const out: string[] = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === sep && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  });
}
