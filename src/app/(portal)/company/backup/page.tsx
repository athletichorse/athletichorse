import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { KEEP_NIGHTS, listBackups } from "@/lib/backup";

export const dynamic = "force-dynamic";

const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Backups: the nightly copies kept in private storage, and a full download for the owner (monthly). */
export default async function BackupPage() {
  await requirePermission("settings.edit");
  const { t, locale } = await getDict();
  const B = t.company.backup;
  const [{ data: rows }, saved] = await Promise.all([
    db().from("settings").select("key, value").in("key", ["last_backup", "backup_downloaded_at"]),
    listBackups(),
  ]);
  const last = rows?.find((r) => r.key === "last_backup")?.value as { at: string; size: number; tables: number; rows: number } | undefined;
  const downloadedAt = rows?.find((r) => r.key === "backup_downloaded_at")?.value as string | undefined;
  return (
    <>
      <PageHeader title={B.title} subtitle={B.subtitle} t={t}>
        <Link href="/company" className="btn-ghost no-print">← {t.company.title}</Link>
      </PageHeader>
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <section className="card space-y-2" data-testid="backup-nightly">
          <h2 className="card-title">{B.nightly}</h2>
          <p className="hint -mt-2">{B.nightlyHint.replace("{n}", String(KEEP_NIGHTS))}</p>
          <p className="text-sm">{last ? `${B.last}: ${formatDateTime(new Date(last.at), locale)} · ${last.tables} ${B.tables} · ${last.rows} ${B.rows} · ${size(last.size)}` : B.noneYet}</p>
        </section>
        <section className="card space-y-3" data-testid="backup-download">
          <h2 className="card-title">{B.monthly}</h2>
          <p className="hint -mt-2">{B.monthlyHint}</p>
          <a href="/company/backup/download" download className="btn-primary inline-block">⬇ {B.downloadNow}</a>
          <p className="text-sm text-gray-600">{downloadedAt ? `${B.lastDownload}: ${formatDateTime(new Date(downloadedAt), locale)}` : B.neverDownloaded}</p>
        </section>
      </div>
      <section className="card overflow-hidden p-0">
        <h2 className="card-title px-5 pt-5">{B.saved} ({saved.length})</h2>
        {saved.length === 0 ? <p className="px-5 pb-5 text-sm text-gray-500">{B.noneYet}</p> : (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>{B.file}</th><th>{B.size}</th><th></th></tr></thead>
            <tbody>
              {saved.map((f) => (
                <tr key={f.name}>
                  <td className="cell-title font-mono text-sm" dir="ltr">{f.name}</td>
                  <td data-label={B.size}>{f.size ? size(f.size) : "—"}</td>
                  <td><a href={`/company/backup/download?file=${encodeURIComponent(f.name)}`} download className="btn-ghost py-1">⬇ {B.download}</a></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
    </>
  );
}
