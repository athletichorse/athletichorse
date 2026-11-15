import { requirePermission } from "@/lib/auth";
import { getDict } from "@/lib/locale";
import { PageHeader } from "@/components/PageHeader";
import { ProductUpload } from "@/components/ProductUpload";
import { PriceFile } from "@/components/PriceFile";

export const maxDuration = 300;

export default async function UploadPage() {
  const me = await requirePermission("upload.import");
  const { t } = await getDict();
  return (
    <>
      <PageHeader title={t.upload.title} subtitle={t.upload.subtitle} t={t} />
      <ProductUpload t={t} />
      {me.perms.has("products.edit") && <div className="mt-6"><PriceFile t={t} /></div>}
    </>
  );
}
