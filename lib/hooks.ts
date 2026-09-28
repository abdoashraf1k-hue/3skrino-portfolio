"use client";

import { useSyncExternalStore } from "react";

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

/** Desktop-sized viewport with motion allowed — gates WebGL, parallax and artifacts. */
export const RICH_MOTION_QUERY = "(min-width: 768px) and (prefers-reduced-motion: no-preference)";
