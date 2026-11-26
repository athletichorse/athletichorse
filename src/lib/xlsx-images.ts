/**
 * Pictures inside an .xlsx (supplier proformas): which sheet row each picture sits on.
 * Works in the browser and in Node (DecompressionStream). Two kinds of files:
 *  - Excel / most tools: pictures floating over cells (xl/drawings/drawingN.xml, anchored "from" a row);
 *  - WPS (common in China): pictures inside cells (xl/cellimages.xml + =DISPIMG("ID_…") in the cell).
 * Row numbers are 0-based, the same as the rows read by read-excel-file.
 */
export type SheetImage = { row: number; col: number; bytes: Uint8Array; type: string };

const u16 = (d: DataView, o: number) => d.getUint16(o, true);
const u32 = (d: DataView, o: number) => d.getUint32(o, true);

/** The files of a zip (only those `want` accepts), decompressed. No zip64 (not needed for proformas). */
export async function unzip(buf: ArrayBuffer, want: (name: string) => boolean): Promise<Map<string, Uint8Array>> {
  const d = new DataView(buf);
  const out = new Map<string, Uint8Array>();
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (u32(d, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return out;
  const count = u16(d, eocd + 10);
  let p = u32(d, eocd + 16);
  const dec = new TextDecoder();
  for (let n = 0; n < count && p + 46 <= buf.byteLength; n++) {
    if (u32(d, p) !== 0x02014b50) break;
    const method = u16(d, p + 10), size = u32(d, p + 20), nameLen = u16(d, p + 28), extra = u16(d, p + 30), comment = u16(d, p + 32), local = u32(d, p + 42);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    p += 46 + nameLen + extra + comment;
    if (!want(name) || u32(d, local) !== 0x04034b50) continue;
    const start = local + 30 + u16(d, local + 26) + u16(d, local + 28);
    const raw = new Uint8Array(buf.slice(start, start + size));
    if (method === 0) out.set(name, raw);
    else if (method === 8) {
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      out.set(name, new Uint8Array(await new Response(stream).arrayBuffer()));
    }
  }
  return out;
}

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", webp: "image/webp" };
const typeOf = (path: string) => TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? null;

/** "../media/image1.png" seen from "xl/drawings/drawing1.xml" → "xl/media/image1.png". */
export function resolve(from: string, target: string) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = from.split("/").slice(0, -1);
  for (const seg of target.split("/")) { if (seg === "..") parts.pop(); else if (seg !== ".") parts.push(seg); }
  return parts.join("/");
}
const relsOf = (path: string) => { const parts = path.split("/"); const file = parts.pop(); return [...parts, "_rels", `${file}.rels`].join("/"); };

/** Relationship id → target path. */
export function readRels(xml: string, owner: string) {
  const m = new Map<string, string>();
  for (const r of xml.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)) {
    const id = r[0].match(/\bId="([^"]+)"/)?.[1], target = r[0].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) m.set(id, resolve(owner, target));
  }
  return m;
}

/** Floating pictures of a drawing: row/col where each one starts, and the media file. */
export function readDrawing(xml: string, rels: Map<string, string>) {
  const out: { row: number; col: number; path: string }[] = [];
  for (const a of xml.matchAll(/<(\w+:)?(oneCellAnchor|twoCellAnchor)\b[\s\S]*?<\/\1?\2>/g)) {
    const from = a[0].match(/<(?:\w+:)?from>([\s\S]*?)<\/(?:\w+:)?from>/)?.[1] ?? "";
    const row = Number(from.match(/<(?:\w+:)?row>(\d+)</)?.[1]), col = Number(from.match(/<(?:\w+:)?col>(\d+)</)?.[1]);
    const embed = a[0].match(/\br:embed="([^"]+)"/)?.[1] ?? a[0].match(/\bembed="([^"]+)"/)?.[1];
    const path = embed ? rels.get(embed) : undefined;
    if (Number.isFinite(row) && path) out.push({ row, col: Number.isFinite(col) ? col : 0, path });
  }
  return out;
}

/** WPS pictures in cells: cell → picture name (from =DISPIMG("ID_…")), and picture name → media file. */
export function readDispImg(sheetXml: string) {
  const out: { row: number; col: number; id: string }[] = [];
  for (const c of sheetXml.matchAll(/<c\b[^>]*\br="([A-Z]+)(\d+)"[^>]*>([\s\S]*?)<\/c>/g)) {
    const id = c[3].match(/DISPIMG\(\s*(?:&quot;|")([^"&]+)(?:&quot;|")/)?.[1];
    if (!id) continue;
    const col = [...c[1]].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    out.push({ row: Number(c[2]) - 1, col, id });
  }
  return out;
}
export function readCellImages(xml: string, rels: Map<string, string>) {
  const m = new Map<string, string>();
  for (const p of xml.matchAll(/<(?:\w+:)?pic\b[\s\S]*?<\/(?:\w+:)?pic>/g)) {
    const name = p[0].match(/<(?:\w+:)?cNvPr\b[^>]*\bname="([^"]+)"/)?.[1];
    const embed = p[0].match(/\br:embed="([^"]+)"/)?.[1];
    const path = embed ? rels.get(embed) : undefined;
    if (name && path) m.set(name, path);
  }
  return m;
}

/** Every picture of the first sheet (the one read-excel-file reads), with its row. */
export async function sheetImages(buf: ArrayBuffer): Promise<SheetImage[]> {
  const files = await unzip(buf, (n) => n.endsWith(".xml") || n.endsWith(".rels") || /^xl\/media\//.test(n));
  const text = (p: string) => (files.has(p) ? new TextDecoder().decode(files.get(p)) : "");
  // first sheet of the workbook
  const wb = text("xl/workbook.xml");
  const firstRid = wb.match(/<(?:\w+:)?sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const wbRels = readRels(text("xl/_rels/workbook.xml.rels"), "xl/workbook.xml");
  const sheet = (firstRid && wbRels.get(firstRid)) || "xl/worksheets/sheet1.xml";
  const sheetRels = readRels(text(relsOf(sheet)), sheet);
  const found: { row: number; col: number; path: string }[] = [];
  for (const target of sheetRels.values()) {
    if (!/drawings\/drawing\d*\.xml$/.test(target)) continue;
    found.push(...readDrawing(text(target), readRels(text(relsOf(target)), target)));
  }
  // WPS pictures in cells
  const cells = readDispImg(text(sheet));
  if (cells.length && files.has("xl/cellimages.xml")) {
    const names = readCellImages(text("xl/cellimages.xml"), readRels(text("xl/_rels/cellimages.xml.rels"), "xl/cellimages.xml"));
    for (const c of cells) { const path = names.get(c.id); if (path) found.push({ row: c.row, col: c.col, path }); }
  }
  const out: SheetImage[] = [];
  for (const f of found) {
    const bytes = files.get(f.path), type = typeOf(f.path);
    if (bytes && type) out.push({ row: f.row, col: f.col, bytes, type });
  }
  return out.sort((a, b) => a.row - b.row || a.col - b.col);
}

/** A small JPEG (longest side `max` px) as a data URL, for showing and saving; null where there is no canvas. */
export async function thumbnail(img: SheetImage, max = 160): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(new Blob([img.bytes as Uint8Array<ArrayBuffer>], { type: img.type }));
  try {
    const el = new Image();
    await new Promise<void>((ok, bad) => { el.onload = () => ok(); el.onerror = () => bad(new Error("image")); el.src = url; });
    const k = Math.min(1, max / Math.max(el.naturalWidth, el.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(el.naturalWidth * k)); c.height = Math.max(1, Math.round(el.naturalHeight * k));
    const g = c.getContext("2d");
    if (!g) return null;
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(el, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}
