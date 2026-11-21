import { gzipSync } from "node:zlib";
import { db } from "@/lib/supabase/admin";

export const BACKUP_BUCKET = "backups";
export const KEEP_NIGHTS = 35;

/**
 * A full copy of the app's data: every table with all its rows, as gzipped JSON.
 * { kind, created_at, tables: { <table>: [rows…] } } — enough to rebuild the data.
 * Staff logins (passwords) are not included; staff are re-invited after a restore.
 */
export async function buildBackup(): Promise<{ file: Buffer; tables: number; rows: number }> {
  const { data: names, error } = await db().rpc("backup_tables");
  if (error) throw new Error(error.message);
  const tables: Record<string, unknown[]> = {};
  let rows = 0;
  for (const name of (names ?? []) as string[]) {
    const { data, error: e } = await db().rpc("backup_table_rows", { p_table: name });
    if (e) throw new Error(`${name}: ${e.message}`);
    tables[name] = (data ?? []) as unknown[];
    rows += tables[name].length;
  }
  const json = JSON.stringify({ kind: "portal-backup", version: 1, created_at: new Date().toISOString(), tables });
  return { file: gzipSync(Buffer.from(json, "utf8")), tables: Object.keys(tables).length, rows };
}

/** Riyadh date, e.g. 2026-11-21 (file names). */
export const riyadhDay = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });

/** The nightly copy: saved in a private storage bucket; copies older than KEEP_NIGHTS are removed. */
export async function saveNightlyBackup(): Promise<{ ok: true; path: string; size: number; tables: number; rows: number } | { ok: false; error: string }> {
  try {
    const storage = db().storage;
    const { data: bucket } = await storage.getBucket(BACKUP_BUCKET);
    if (!bucket) {
      const { error } = await storage.createBucket(BACKUP_BUCKET, { public: false });
      if (error && !/exists/i.test(error.message)) return { ok: false, error: error.message };
    }
    const b = await buildBackup();
    const path = `nightly/backup-${riyadhDay()}.json.gz`;
    const { error: up } = await storage.from(BACKUP_BUCKET).upload(path, b.file, { contentType: "application/gzip", upsert: true });
    if (up) return { ok: false, error: up.message };
    // keep the last KEEP_NIGHTS nights
    const { data: list } = await storage.from(BACKUP_BUCKET).list("nightly", { limit: 1000, sortBy: { column: "name", order: "desc" } });
    const old = (list ?? []).map((f) => f.name).filter((n) => /^backup-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(n)).slice(KEEP_NIGHTS);
    if (old.length) await storage.from(BACKUP_BUCKET).remove(old.map((n) => `nightly/${n}`));
    const info = { at: new Date().toISOString(), path, size: b.file.length, tables: b.tables, rows: b.rows };
    await db().from("settings").upsert({ key: "last_backup", value: info });
    return { ok: true, ...info };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Saved nightly copies, newest first. */
export async function listBackups(): Promise<{ name: string; size: number }[]> {
  try {
    const { data } = await db().storage.from(BACKUP_BUCKET).list("nightly", { limit: 100, sortBy: { column: "name", order: "desc" } });
    return (data ?? []).filter((f) => /^backup-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f.name)).map((f) => ({ name: f.name, size: Number((f.metadata as { size?: number } | null)?.size ?? 0) }));
  } catch { return []; }
}
