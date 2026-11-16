import { TabNav } from "./TabNav";
import type { Dict } from "@/i18n";

/** Tabs across the Stores area. */
export function StockTabs({ t, active, canRequests }: { t: Dict; active: "stock" | "docs" | "requests" | "shortages"; canRequests: boolean }) {
  const tabs = [
    ["stock", "/stock", t.stock.flow.tabs.stock],
    ["docs", "/stock/docs", t.stock.flow.tabs.docs],
    ...(canRequests ? [["requests", "/stock/requests", t.stock.flow.tabs.requests]] : []),
    ["shortages", "/stock/shortages", t.stock.flow.tabs.shortages],
  ] as [string, string, string][];
  return (
    <TabNav tabs={tabs} active={active} />
  );
}

/** Locations a person may LOOK at: their own, or all with "stock of all branches and stores". */
export function viewableLocations<T extends { id: string }>(all: T[], me: { locations: "all" | string[]; perms: ReadonlySet<string> }): T[] {
  if (me.locations === "all" || me.perms.has("stock.all_locations")) return all;
  return all.filter((l) => (me.locations as string[]).includes(l.id));
}
