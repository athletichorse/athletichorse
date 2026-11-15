import type { Dict } from "@/i18n";
import { PrintMenu } from "./PrintMenu";

export function PageHeader({ title, subtitle, t, filename, children }: { title: string; subtitle?: string; t: Dict; filename?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight break-words text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <PrintMenu t={t} filename={filename} />
      </div>
    </div>
  );
}
