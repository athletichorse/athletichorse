"use client";

import { useEffect } from "react";

/** Installs the service worker that keeps the Cashier page available offline (production only). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => { /* not supported here: online use still works */ });
  }, []);
  return null;
}
