import { track } from "@vercel/analytics";

/**
 * Custom events → Google Analytics (when NEXT_PUBLIC_GA_ID loaded gtag) and
 * Vercel Analytics. Every call is a silent no-op on the server or when a
 * provider isn't present.
 */

type Params = Record<string, string | number | boolean>;

declare global {
  interface Window {
    gtag?: (command: "event", name: string, params?: Params) => void;
  }
}

function send(name: string, params: Params) {
  if (typeof window === "undefined") return;
  try {
    window.gtag?.("event", name, params);
    track(name, params);
  } catch {
    // analytics must never break the page
  }
}

export const trackProjectView = (projectId: string) => send("project_view", { project_id: projectId });
export const trackVideoPlay = (projectId: string) => send("video_play", { project_id: projectId });
export const trackCTA = (name: string) => send("cta_click", { cta: name });
