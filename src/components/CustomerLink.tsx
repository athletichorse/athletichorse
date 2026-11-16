"use client";

import { useState } from "react";
import type { Dict } from "@/i18n";

/** The customer's receipt link (opens without a login). */
export function CustomerLink({ t, token }: { t: Dict; token: string }) {
  const [done, setDone] = useState(false);
  const path = `/r/${token}`; // the full address is built when copying (same text on server and browser)
  return (
    <div className="no-print mx-auto mt-4 flex max-w-md flex-wrap items-center justify-center gap-2 text-sm">
      <span className="text-gray-600">{t.pos.extra.customerLink}:</span>
      <a href={path} target="_blank" rel="noopener" className="max-w-[220px] truncate underline" dir="ltr">{path}</a>
      <button type="button" className="btn-ghost py-1" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}${path}`); setDone(true); } catch { /* blocked */ } }}>{done ? t.pos.extra.copied : t.pos.extra.copyLink}</button>
    </div>
  );
}
