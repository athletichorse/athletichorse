import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return <ComingSoon perm="customers.view" title={(t) => t.menu.customers} />;
}
