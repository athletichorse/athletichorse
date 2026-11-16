"use client";

import { useEffect } from "react";

/**
 * After saving, the answer ("Saved", or what went wrong) must be seen: when a message appears
 * outside the visible part of the screen (e.g. the page stayed scrolled down), bring it into view.
 */
export function ShowMessage() {
  useEffect(() => {
    const show = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && (r.top < 0 || r.bottom > window.innerHeight)) el.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    const first = document.querySelector("main .alert-ok, main .alert-err");
    if (first) show(first);
    const main = document.querySelector("main");
    if (!main) return;
    const obs = new MutationObserver((list) => {
      for (const m of list) for (const n of m.addedNodes) {
        if (!(n instanceof Element)) continue;
        const el = n.matches(".alert-ok, .alert-err") ? n : n.querySelector(".alert-ok, .alert-err");
        if (el) { show(el); return; }
      }
    });
    obs.observe(main, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);
  return null;
}
