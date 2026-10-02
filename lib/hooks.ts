"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

/** SSR-safe media query. Returns `false` on the server and during hydration. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * True once `ref` has come within `rootMargin` of the viewport. With `once`
 * (default) it latches — used to mount heavy media only when it's needed.
 */
export function useInView<T extends Element>(
  ref: RefObject<T | null>,
  { rootMargin = "200px", once = true, threshold = 0 }: { rootMargin?: string; once?: boolean; threshold?: number } = {},
): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, once, threshold]);
  return inView;
}

/** Desktop-sized viewport with motion allowed — gates WebGL, parallax and artifacts. */
export const RICH_MOTION_QUERY = "(min-width: 768px) and (prefers-reduced-motion: no-preference)";
