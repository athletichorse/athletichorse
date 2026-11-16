import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { db } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import { AuditTabs } from "@/components/AuditTabs";

type Row = { id: number; at: string; user_id: string | null; action: string; entity: string; entity_id: string | null; details: Record<string, unknown> };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const me = await requirePermission("audit.view");
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ data, count }, { data: people }] = await Promise.all([
    db().from("audit_log").select("id, at, user_id, action, entity, entity_id, details", { count: "exact" }).order("id", { ascending: false }).range((page - 1) * 50, page * 50 - 1),
    db().from("profiles").select("id, full_name"),
  ]);
  const rows = (data ?? []) as Row[];
  const who = (id: string | null) => people?.find((p) => p.id === id)?.full_name ?? "—";
  const pages = Math.max(1, Math.ceil((count ?? 0) / 50));
  return (
    <>
      <PageHeader title={t.audit.title} subtitle={t.audit.subtitle} t={t} filename="audit" />
      <AuditTabs t={t} active="log" canEdit={me.perms.has("permissions.edit")} />
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="table" data-export>
            <thead><tr><th>{t.audit.action}</th><th>{t.audit.when}</th><th>{t.audit.who}</th><th>{t.audit.details}</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-gray-500">{t.audit.none}</td></tr>}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="cell-title font-mono text-xs" dir="ltr">{r.action}</td>
                  <td data-label={t.audit.when} className="text-xs text-gray-500 whitespace-nowrap">{formatDateTime(new Date(r.at), locale)}</td>
                  <td data-label={t.audit.who}>{who(r.user_id)}</td>
                  <td data-label={t.audit.details} className="max-w-md truncate font-mono text-xs text-gray-600" dir="ltr">{JSON.stringify(r.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="no-print mt-4 flex items-center justify-end gap-2 text-sm text-gray-600">
        {page > 1 && <Link href={`/audit?page=${page - 1}`} className="btn-ghost">{t.products.prev}</Link>}
        <span>{page} {t.products.of} {pages}</span>
        {page < pages && <Link href={`/audit?page=${page + 1}`} className="btn-ghost">{t.products.next}</Link>}
      </div>
    </>
  );
}
