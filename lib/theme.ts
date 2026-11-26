"use client";

import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

export const THEME_KEY = "3skrino-theme";
const EVENT = "3skrino:theme";

/**
 * Runs in <head> before first paint: stored choice → else the OS preference →
 * else dark. Kept as a string so it can be inlined without a bundle.
 */
export const THEME_BOOT_SCRIPT = `(function(){document.documentElement.dataset.theme="dark";try{localStorage.setItem("${THEME_KEY}","dark")}catch(e){}})();`;

function read(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => "dark");
}

export function setTheme(_theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = "dark";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#0a0a0a");
  try {
    localStorage.setItem(THEME_KEY, "dark");
  } catch {
    // storage blocked — dark mode still applies to this page view
  }
  window.dispatchEvent(new Event(EVENT));
}

export function toggleTheme(): void {
  setTheme("dark");
}
