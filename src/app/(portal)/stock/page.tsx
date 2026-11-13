import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return <ComingSoon perm="stock.view" title={(t) => t.menu.stock} />;
}
