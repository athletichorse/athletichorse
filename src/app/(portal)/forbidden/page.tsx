import { getDict } from "@/lib/locale";

export default async function Forbidden() {
  const { t } = await getDict();
  return <div className="card text-red-700">{t.forbidden}</div>;
}
