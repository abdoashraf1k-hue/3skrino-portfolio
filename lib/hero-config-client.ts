"use client";

import { useSyncExternalStore } from "react";
import { heroConfig, type HeroConfig } from "@/data/hero-config";

/**
 * The committed hero config — or, inside the admin's preview iframe
 * (/?heroPreview=1), the draft the admin posts in, so settings preview live
 * before they're saved and deployed. Drafts are only accepted from the
 * same-origin parent window.
 */

export const HERO_PREVIEW_MESSAGE = "3skrino:hero-config";

let override: HeroConfig | null = null;
const listeners = new Set<() => void>();
let installed = false;

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  if (window.parent === window || !new URLSearchParams(window.location.search).has("heroPreview")) return;
  window.addEventListener("message", (e: MessageEvent<unknown>) => {
    if (e.origin !== window.location.origin || e.source !== window.parent) return;
    const data = e.data;
    if (typeof data !== "object" || data === null || !("type" in data) || data.type !== HERO_PREVIEW_MESSAGE) return;
    if (!("config" in data) || typeof data.config !== "object" || data.config === null) return;
    override = data.config as HeroConfig;
    for (const l of listeners) l();
  });
  // Tell the admin we're listening so it can send the current draft.
  window.parent.postMessage({ type: `${HERO_PREVIEW_MESSAGE}:ready` }, window.location.origin);
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
    () => override ?? heroConfig,
    () => heroConfig,
  );
}
