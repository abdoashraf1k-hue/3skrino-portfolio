"use client";

import type Lenis from "lenis";

/** The page's Lenis instance while smooth scrolling is on (set by SmoothScroll). */
let lenis: Lenis | null = null;

export function setLenis(instance: Lenis | null): void {
  lenis = instance;
}

/** Scrolls to a y offset or an element — through Lenis when it's running, else natively. */
export function scrollToTarget(target: number | HTMLElement, offset = 0): void {
  if (lenis) {
    lenis.scrollTo(target, { offset, duration: 1.4 });
    return;
  }
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const top = typeof target === "number" ? target : target.getBoundingClientRect().top + window.scrollY + offset;
  window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
}
