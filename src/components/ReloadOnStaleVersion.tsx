"use client";

import { useEffect } from "react";

/**
 * Safety net for version skew: if a code file from an older deployment can't be
 * loaded (the page was opened before an update went live), reload the page once.
 */
export function ReloadOnStaleVersion() {
  useEffect(() => {
    const isChunkError = (msg: string) => /ChunkLoadError|Loading chunk|Failed to load chunk|Failed to fetch dynamically imported module|Server Action .* was not found/i.test(msg);
    const reload = () => {
      try {
        const last = Number(sessionStorage.getItem("stale-reload") || 0);
        if (Date.now() - last < 30_000) return; // never loop
        sessionStorage.setItem("stale-reload", String(Date.now()));
      } catch {}
      window.location.reload();
    };
    const onError = (e: ErrorEvent) => isChunkError(String(e.message || e.error?.message || "")) && reload();
    const onRejection = (e: PromiseRejectionEvent) => isChunkError(String(e.reason?.message || e.reason || "")) && reload();
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
