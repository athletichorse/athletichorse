"use client";

import { useState } from "react";
import type { Dict } from "@/i18n";

type Mode = "receipt80" | "a4" | "pdf";

function print(mode: Mode) {
  const html = document.documentElement;
  html.dataset.print = mode === "pdf" ? "a4" : mode;
  const done = () => {
    delete html.dataset.print;
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  // PDF = the browser's "Save as PDF" destination in the print dialog.
  window.print();
}

/** Exports the first <table data-export> on the page as an Excel-readable CSV (UTF-8 BOM for Arabic). */
function exportExcel(filename: string) {
  const table = document.querySelector<HTMLTableElement>("table[data-export]") ?? document.querySelector("table");
  if (!table) return;
  const rows = [...table.rows].map((r) =>
    [...r.cells].map((c) => `"${(c.innerText ?? "").replace(/"/g, '""').trim()}"`).join(","),
  );
  const blob = new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function PrintMenu({ t, filename = "export" }: { t: Dict; filename?: string }) {
  const [open, setOpen] = useState(false);
  const item = "block w-full px-4 py-2 text-start text-sm hover:bg-gray-100";
  return (
    <div className="no-print relative inline-block">
      <button className="btn-ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        🖨 {t.print.menu}
      </button>
      {open && (
        <div className="absolute end-0 z-30 mt-1 w-48 overflow-hidden rounded-lg border bg-white shadow-lg" onClick={() => setOpen(false)}>
          <button className={item} onClick={() => print("receipt80")}>{t.print.receipt80}</button>
          <button className={item} onClick={() => print("a4")}>{t.print.a4}</button>
          <button className={item} onClick={() => exportExcel(filename)}>{t.print.excel}</button>
          <button className={item} onClick={() => print("pdf")}>{t.print.pdf}</button>
        </div>
      )}
    </div>
  );
}
