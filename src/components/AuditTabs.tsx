import { TabNav } from "./TabNav";
import type { Dict } from "@/i18n";

export function AuditTabs({ t, active, canEdit }: { t: Dict; active: "log" | "hours" | "devices"; canEdit: boolean }) {
  const tabs = [["log", "/audit", t.security.log], ...(canEdit ? [["hours", "/audit/hours", t.security.hours], ["devices", "/audit/devices", t.security.devices]] : [])] as [string, string, string][];
  return (
    <TabNav tabs={tabs} active={active} />
  );
}
