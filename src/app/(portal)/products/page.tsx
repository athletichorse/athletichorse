import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return <ComingSoon perm="products.view" title={(t) => t.menu.products} />;
}
