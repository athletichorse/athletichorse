import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return <ComingSoon perm="upload.import" title={(t) => t.menu.upload} />;
}
