"use client";

import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

export const THEME_KEY = "3skrino-theme";
const EVENT = "3skrino:theme";

/**
 * Runs in <head> before first paint: stored choice → else the OS preference →
 * else dark. Kept as a string so it can be inlined without a bundle.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})();`;

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

export function setTheme(theme: Theme): void {
  const root = document.documentElement;
  const animate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (animate) root.classList.add("theme-switching");
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#fafafa" : "#0a0a0a");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // storage blocked — the choice still applies to this page view
  }
  window.dispatchEvent(new Event(EVENT));
  if (animate) window.setTimeout(() => root.classList.remove("theme-switching"), 320);
}

export function toggleTheme(): void {
  setTheme(read() === "light" ? "dark" : "light");
}
