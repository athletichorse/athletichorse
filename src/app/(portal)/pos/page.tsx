import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return <ComingSoon perm={["pos.collect", "pos.desk", "pos.quick_sale"]} title={(t) => t.menu.pos} icon="pos" />;
}
