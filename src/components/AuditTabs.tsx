import Link from "next/link";
import type { Dict } from "@/i18n";

export function AuditTabs({ t, active, canEdit }: { t: Dict; active: "log" | "hours" | "devices"; canEdit: boolean }) {
  const tabs = [["log", "/audit", t.security.log], ...(canEdit ? [["hours", "/audit/hours", t.security.hours], ["devices", "/audit/devices", t.security.devices]] : [])] as [string, string, string][];
  return (
    <nav className="no-print mb-4 flex gap-1 overflow-x-auto border-b border-[var(--line)]">
      {tabs.map(([k, href, label]) => <Link key={k} href={href} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap ${active === k ? "border-[var(--brand)] text-[var(--brand)]" : "border-transparent text-gray-600 hover:text-gray-900"}`}>{label}</Link>)}
    </nav>
  );
}
