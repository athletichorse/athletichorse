import type { Dict } from "@/i18n";
import { PrintMenu } from "./PrintMenu";

export function PageHeader({ title, t, filename, children }: { title: string; t: Dict; filename?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <h1 className="flex-1 text-xl font-bold">{title}</h1>
      {children}
      <PrintMenu t={t} filename={filename} />
    </div>
  );
}
