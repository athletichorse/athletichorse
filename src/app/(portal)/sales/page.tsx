import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return <ComingSoon perm="sales.view" title={(t) => t.menu.sales} />;
}
