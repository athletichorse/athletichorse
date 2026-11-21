import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { BACKUP_BUCKET, buildBackup, riyadhDay } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Download a full backup (owner / settings): a fresh one now, or ?file=<a saved nightly copy>.
 * Each download is recorded, so the monthly reminder on Home goes away for that month.
 */
export async function GET(req: Request) {
  const me = await requireStaff();
  if (!me.perms.has("settings.edit")) return new Response("forbidden", { status: 403 });
  const file = new URL(req.url).searchParams.get("file");
  let body: Buffer, name: string;
  if (file) {
    if (!/^backup-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(file)) return new Response("bad file", { status: 400 });
    const { data, error } = await db().storage.from(BACKUP_BUCKET).download(`nightly/${file}`);
    if (error || !data) return new Response("not found", { status: 404 });
    body = Buffer.from(await data.arrayBuffer());
    name = file;
  } else {
    body = (await buildBackup()).file;
    name = `backup-${riyadhDay()}-full.json.gz`;
  }
  await db().from("settings").upsert({ key: "backup_downloaded_at", value: new Date().toISOString() });
  await audit(me.id, "backup.download", "backup", null, { file: name, size: body.length });
  return new Response(new Uint8Array(body), {
    headers: { "content-type": "application/gzip", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
  });
}
