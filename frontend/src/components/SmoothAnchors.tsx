"use client";

import gsap from "gsap";
import {ScrollToPlugin} from "gsap/ScrollToPlugin";
import {useEffect} from "react";

gsap.registerPlugin(ScrollToPlugin);

/// Animates in-page anchor jumps instead of teleporting.
///
/// Clicking a nav item moved the viewport in a single frame, which reads as the page breaking
/// rather than navigating — you lose all sense of where the section sits relative to where you
/// were. Easing it keeps that spatial thread.
///
/// Implemented as a document-level listener rather than by rewriting the nav, because the links
/// live inside a vendored component and this also covers any other in-page anchor added later.
export function SmoothAnchors({offset = 96}: {offset?: number}) {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Leave modified clicks alone — cmd/ctrl-click means "open elsewhere", not "scroll here".
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }

      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      const href = anchor?.getAttribute("href");
      if (!href?.startsWith("#") || href.length < 2) return;

      const target = document.querySelector(href);
      if (!target) return;

      e.preventDefault();

      // Reduced motion still navigates — it just arrives immediately.
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      gsap.to(window, {
        scrollTo: {y: target as Element, offsetY: offset, autoKill: true},
        duration: reduced ? 0 : 0.9,
        ease: "power2.inOut",
        // Keep the URL honest so the section stays linkable and the back button works.
        onComplete: () => history.replaceState(null, "", href),
      });
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [offset]);

  return null;
}
