import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return <ComingSoon perm="stock.log" title={(t) => t.menu.stockLog} />;
}
