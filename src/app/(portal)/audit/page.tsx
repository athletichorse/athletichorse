import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return <ComingSoon perm="audit.view" title={(t) => t.menu.audit} />;
}
