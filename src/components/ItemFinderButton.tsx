"use client";

import { useState } from "react";
import type { Dict, Locale } from "@/i18n";
import type { VariantHit } from "@/app/actions/stock";
import { ColumnSearch } from "./pos/ColumnSearch";

/** ▦ Search by columns next to an item search box (or alone, to look up stock). */
export function ItemFinderButton({ t, locale, locationId, onPick, browse = false }: { t: Dict; locale: Locale; locationId: string | null; onPick?: (h: VariantHit, qty?: string) => void; browse?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`btn-ghost shrink-0 whitespace-nowrap ${open ? "border-[var(--brand)] text-[var(--brand)]" : ""}`} aria-expanded={open} data-testid="column-search-open" onClick={() => setOpen(!open)}>
        ▦ <span className={browse ? "" : "hidden sm:inline"}>{t.pos.colSearch.open}</span>
      </button>
      {open && <div className="mt-2 basis-full"><ColumnSearch t={t} locale={locale} locationId={locationId} browse={browse} onClose={() => setOpen(false)} onPick={onPick} /></div>}
    </>
  );
}
