"use client";

import { useEffect } from "react";
import { trackCTA, trackProjectView } from "@/lib/analytics";

/**
 * One delegated listener instead of turning every card into a client
 * component: any element with data-track="project" | "cta" reports its click.
 */
export default function AnalyticsListener() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>("[data-track]");
      if (!el) return;
      const id = el.dataset.trackId ?? "";
      if (el.dataset.track === "project" && id) trackProjectView(id);
      else if (el.dataset.track === "cta") trackCTA(id || el.textContent?.trim() || "cta");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
