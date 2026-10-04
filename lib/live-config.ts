"use client";

import { useSyncExternalStore } from "react";
import { heroConfig, type HeroConfig } from "@/data/hero-config";
import { siteConfig, type SiteConfig } from "@/data/site-config";

/**
 * The committed configs — or, inside the admin's live-preview iframe
 * (any URL with ?preview=1), the unsaved drafts the admin posts in, so every
 * setting previews instantly before it's saved and deployed. Drafts are only
 * accepted from the same-origin parent window.
 */

export const PREVIEW_MESSAGE = "3skrino:preview";
export const PREVIEW_READY = "3skrino:preview:ready";
export const PREVIEW_PARAM = "preview";
/** Admin → preview frame: "play a page transition now" (Effects → Fire in preview). */
export const PREVIEW_FX = "3skrino:preview:fx";
/** Fired on the admin window by any tab; the preview dock forwards it to its frame. */
export const ADMIN_PREVIEW_FX_EVENT = "3skrino:admin:preview-fx";

type Draft = { hero: HeroConfig | null; site: SiteConfig | null };
let draft: Draft = { hero: null, site: null };
const listeners = new Set<() => void>();
let installed = false;

export function isPreviewFrame(): boolean {
  return typeof window !== "undefined" && window.parent !== window && new URLSearchParams(window.location.search).has(PREVIEW_PARAM);
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  if (!isPreviewFrame()) return;
  window.addEventListener("message", (e: MessageEvent<unknown>) => {
    if (e.origin !== window.location.origin || e.source !== window.parent) return;
    const data = e.data;
    if (typeof data === "object" && data !== null && "type" in data && data.type === PREVIEW_FX) {
      // Same event lib/cinematic's emitFx("transition") dispatches (not imported: it depends on this module).
      window.dispatchEvent(new CustomEvent("3skrino:fx", { detail: "transition" }));
      return;
    }
    if (typeof data !== "object" || data === null || !("type" in data) || data.type !== PREVIEW_MESSAGE) return;
    const next: Draft = { ...draft };
    if ("hero" in data && typeof data.hero === "object" && data.hero !== null) next.hero = data.hero as HeroConfig;
    if ("site" in data && typeof data.site === "object" && data.site !== null) next.site = data.site as SiteConfig;
    draft = next;
    for (const l of listeners) l();
  });
  // Tell the admin we're listening so it can send the current drafts.
  window.parent.postMessage({ type: PREVIEW_READY }, window.location.origin);
}

function subscribe(cb: () => void) {
  install();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useHeroConfig(): HeroConfig {
  return useSyncExternalStore(
    subscribe,
    () => draft.hero ?? heroConfig,
    () => heroConfig,
  );
}

export function useSiteConfig(): SiteConfig {
  return useSyncExternalStore(
    subscribe,
    () => draft.site ?? siteConfig,
    () => siteConfig,
  );
}
