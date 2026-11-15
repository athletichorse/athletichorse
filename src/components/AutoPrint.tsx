"use client";

import { useEffect } from "react";

/** Opens the print dialog once, in the given layout (e.g. 80 mm receipt). */
export function AutoPrint({ mode }: { mode: "receipt80" | "a4" }) {
  useEffect(() => {
    document.documentElement.dataset.print = mode;
    const done = () => delete document.documentElement.dataset.print;
    window.addEventListener("afterprint", done, { once: true });
    const id = setTimeout(() => window.print(), 400);
    return () => clearTimeout(id);
  }, [mode]);
  return null;
}
