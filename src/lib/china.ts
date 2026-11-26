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

export type CnLine = { supplier_code: string; description: string; variant_id: string | null; cartons: string; per_carton: string; unit_price: string; carton_cbm: string; image_url?: string | null; sku?: string | null; src_row?: number };
export type CnFees = { rate: string; rate_paid: string; fee_shipping: string; fee_customs: string; fee_other: string };

const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[,\s¥￥$]|RMB|CNY|元/gi, "")); return Number.isFinite(n) ? n : 0; };

/**
 * The owner's landed rate (سعر التضريب), one rate for every item:
 *   ratio  = (container in yuan + fees in yuan) ÷ container in yuan      (fees are typed in SAR → ÷ rate)
 *   factor = ratio × rate (SAR per 1 yuan; the rate actually paid when typed)
 *   price in SAR = price in yuan × factor
 * Per line: pieces, CNY value, CBM, landed cost per piece and per line (SAR); and the order totals.
 */
export function landed(lines: CnLine[], f: CnFees) {
  const rate = num(f.rate), paid = num(f.rate_paid), eff = paid > 0 ? paid : rate;
  const fees = Math.round((num(f.fee_shipping) + num(f.fee_customs) + num(f.fee_other)) * 100) / 100;
  const rows = lines.map((l) => {
    const cartons = num(l.cartons), per = Math.max(1, num(l.per_carton) || 1);
    const qty = cartons * per, cny = qty * num(l.unit_price), cbm = cartons * num(l.carton_cbm);
    return { qty, cny, cbm };
  });
  const totCny = rows.reduce((a, r) => a + r.cny, 0), totCbm = rows.reduce((a, r) => a + r.cbm, 0);
  const feesCny = eff > 0 ? fees / eff : 0;
  const ratio = totCny > 0 ? (totCny + feesCny) / totCny : 1;
  const factor = eff * ratio;
  const out = rows.map((r) => {
    if (r.qty <= 0) return { ...r, unit: null as number | null, line: 0, feesShare: 0 };
    const line = r.cny * factor;
    return { ...r, unit: Math.round((line / r.qty) * 10000) / 10000, line: Math.round(line * 100) / 100, feesShare: Math.round((line - r.cny * eff) * 100) / 100 };
  });
  const goodsSar = Math.round(totCny * eff * 100) / 100;
  const pieces = rows.reduce((a, r) => a + r.qty, 0);
  return {
    rows: out, totCny: Math.round(totCny * 100) / 100, totCbm: Math.round(totCbm * 1000) / 1000, goodsSar, fees,
    feesCny: Math.round(feesCny * 100) / 100, ratio: Math.round(ratio * 10000) / 10000, factor: Math.round(factor * 10000) / 10000,
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

/**
 * Reads the supplier's sheet: finds the header row (Chinese / English / Arabic titles), then one line per item row.
 * Real proforma sheets are messy, so the columns are also judged by what is in them:
 *  - the code column is the one whose cells look like codes (JC-1, A12…), even without a title;
 *  - when two columns are called "description", the one that changes row by row wins (the other is
 *    usually the supplier's name, written once over several rows);
 *  - merged cells (code / description written once for several rows) are filled down;
 *  - prices like "¥18.00" are read as 18.
 */
export function readChinaSheet(rows: unknown[][]): { lines: CnLine[]; found: Partial<Record<Col, boolean>>; totalCbm: boolean } {
  let head = -1; let map: Partial<Record<Col, number>> = {}; let totalCbm = false; let headCells: string[] = [];
  for (let i = 0; i < Math.min(rows.length, 20) && head < 0; i++) {
    const cells = (rows[i] ?? []).map(norm);
    const m: Partial<Record<Col, number>> = {};
    const used = new Set<number>();
    for (const col of ["per", "cartons", "qty", "price", "cbm", "code", "desc"] as Col[]) {
      const j = cells.findIndex((c, k) => !used.has(k) && c && H[col].some((h) => c === h || c.includes(h)));
      if (j >= 0) { m[col] = j; used.add(j); }
    }
    if (Object.keys(m).length >= 3 && (m.price !== undefined || m.cartons !== undefined)) {
      head = i; map = m; headCells = cells;
      totalCbm = m.cbm !== undefined && /total|总/.test(cells[m.cbm]);
    }
  }
  if (head < 0) return { lines: [], found: {}, totalCbm: false };
  const data = rows.slice(head + 1).map((r) => (r ?? []).map((c) => String(c ?? "").trim()));
  const numCols = new Set([map.per, map.cartons, map.qty, map.price, map.cbm].filter((x) => x !== undefined) as number[]);
  // item rows = rows with a quantity / cartons / price number
  const isItem = (r: string[]) => [map.cartons, map.qty, map.price].some((c) => c !== undefined && num(r[c]) > 0);
  const items = data.filter(isItem);
  const width = Math.max(0, ...data.map((r) => r.length));

  // code column: the one that looks like codes in most item rows (header or not)
  const CODE = /^[A-Za-z]{1,8}[-_ .]?\d{1,8}[A-Za-z0-9-]*$/;
  let bestCode = -1, bestCount = 0;
  for (let c = 0; c < width; c++) {
    if (numCols.has(c)) continue;
    const n = items.filter((r) => CODE.test(r[c] ?? "")).length;
    if (n > bestCount) { bestCount = n; bestCode = c; }
  }
  if (bestCode >= 0 && bestCount >= Math.max(1, Math.ceil(items.length * 0.3))) map.code = bestCode;

  // description column: among the columns titled "description", the one with the most different values
  const descCands = headCells.map((c, k) => (c && H.desc.some((h) => c === h || c.includes(h)) && k !== map.code && !numCols.has(k) ? k : -1)).filter((k) => k >= 0);
  const distinct = (c: number) => new Set(items.map((r) => r[c]).filter(Boolean)).size;
  if (descCands.length) map.desc = descCands.sort((a, b) => distinct(b) - distinct(a) || b - a)[0];
  else if (map.desc === undefined) {
    // no title at all: the text column (not the code) with the most different values
    let best = -1, bestN = 0;
    for (let c = 0; c < width; c++) {
      if (c === map.code || numCols.has(c)) continue;
      const n = new Set(items.map((r) => r[c]).filter((v) => v && !/^[\d.,\s¥￥$]+$/.test(v))).size;
      if (n > bestN) { bestN = n; best = c; }
    }
    if (best >= 0) map.desc = best;
  }

  const lines: CnLine[] = [];
  let lastCode = "", lastDesc = "";
  for (const [j, r] of data.entries()) {
    const cell = (c: Col) => (map[c] === undefined ? "" : r[map[c]!] ?? "");
    let code = cell("code"), desc = cell("desc");
    const item = isItem(r);
    if (/^(total|合计|总计|小计|الإجمالي)/i.test(code || desc || r.find(Boolean) || "")) continue;
    // merged cells: an item row with no code / description takes the ones above it
    if (item && !code) code = lastCode;
    if (item && !desc) desc = lastDesc;
    if (code) lastCode = code;
    if (desc) lastDesc = desc;
    if (!item || (!code && !desc)) continue;
    let cartons = num(cell("cartons")); const per = num(cell("per")) || 0; const qty = num(cell("qty"));
    if (!cartons && qty && per) cartons = Math.ceil(qty / per);
    let cbm = num(cell("cbm"));
    if (totalCbm && cartons > 0) cbm = Math.round((cbm / cartons) * 10000) / 10000;
    const price = num(cell("price"));
    lines.push({ supplier_code: code.slice(0, 60), description: desc.replace(/\s+/g, " ").slice(0, 300), variant_id: null, cartons: cartons ? String(cartons) : "",
      per_carton: per ? String(per) : (qty && !cartons ? String(qty) : "1"), unit_price: price ? String(price) : "", carton_cbm: cbm ? String(cbm) : "", src_row: head + 1 + j });
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

/** Picture of each line: the one on its sheet row; a line without one (second row of a merged item) takes the previous line's when the code is the same. */
export function picturesForLines<T extends { src_row?: number; supplier_code: string }>(lines: T[], byRow: Map<number, string>): (string | null)[] {
  let prev: { code: string; pic: string | null } = { code: "", pic: null };
  return lines.map((l) => {
    let pic = l.src_row !== undefined ? byRow.get(l.src_row) ?? null : null;
    if (!pic && l.supplier_code && l.supplier_code === prev.code) pic = prev.pic;
    prev = { code: l.supplier_code, pic };
    return pic;
  });
}
