import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { PageHeader } from "@/components/PageHeader";
import { ProductUpload } from "@/components/ProductUpload";

export const maxDuration = 300;

export default async function UploadPage() {
  await requirePermission("upload.import");
  const { t } = await getDict();
  return (
    <>
      <PageHeader title={t.upload.title} subtitle={t.upload.subtitle} t={t} />
      <ProductUpload t={t} />
    </>
  );
}
