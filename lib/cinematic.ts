"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { DEFAULT_CINEMATIC, defaultScope, EXPERIMENT_EFFECT } from "@/data/cinematic-defaults";
import type { CinematicConfig, EffectId, ScopeRule, SectionId, SoundName } from "@/data/site-config";
import { useSiteConfig } from "@/lib/live-config";

/**
 * Runtime side of the cinematic toolbox (admin → Effects / Experiment Lab /
 * Sections / Cursor / Sound / Motion). Everything here is shared by the FX
 * layers so each listener (scroll, rAF) exists once, however many effects
 * are switched on.
 */

export function useCinematic(): CinematicConfig {
  return useSiteConfig().cinematic ?? DEFAULT_CINEMATIC;
}

/** On when the effect is enabled OR its Experiment Lab switch is. */
export function effectOn(c: CinematicConfig, id: EffectId): boolean {
  if (c.effects[id].enabled) return true;
  const exp = (Object.keys(EXPERIMENT_EFFECT) as (keyof CinematicConfig["experiments"])[]).find((k) => EXPERIMENT_EFFECT[k] === id);
  return exp ? c.experiments[exp] : false;
}

export function scopeOf(c: CinematicConfig, id: EffectId): ScopeRule {
  return c.scopes[id] ?? defaultScope(id);
}

/* ------------------------------------------------------------------ */
/* Viewport: is the hero on screen, which home section is centred      */
/* ------------------------------------------------------------------ */
export type ViewportState = { inHero: boolean; section: SectionId | null };
const SERVER_VIEW: ViewportState = { inHero: true, section: null };
let view: ViewportState = SERVER_VIEW;
const viewListeners = new Set<() => void>();
let viewRaf = 0;

function measureView() {
  viewRaf = 0;
  const mid = window.innerHeight / 2;
  const hero = document.getElementById("home");
  const r = hero?.getBoundingClientRect();
  // The hero counts while it still covers the middle of the screen.
  const inHero = r ? r.top <= mid && r.bottom > mid : false;
  let section: SectionId | null = null;
  for (const el of document.querySelectorAll<HTMLElement>("[data-fx-section]")) {
    const b = el.getBoundingClientRect();
    if (b.top <= mid && b.bottom > mid) {
      section = el.dataset.fxSection as SectionId;
      break;
    }
  }
  if (inHero !== view.inHero || section !== view.section) {
    view = { inHero, section };
    for (const l of viewListeners) l();
  }
}

const scheduleView = () => {
  if (!viewRaf) viewRaf = requestAnimationFrame(measureView);
};

function subscribeView(cb: () => void) {
  viewListeners.add(cb);
  if (viewListeners.size === 1) {
    window.addEventListener("scroll", scheduleView, { passive: true });
    window.addEventListener("resize", scheduleView);
    scheduleView();
  }
  return () => {
    viewListeners.delete(cb);
    if (!viewListeners.size) {
      window.removeEventListener("scroll", scheduleView);
      window.removeEventListener("resize", scheduleView);
      cancelAnimationFrame(viewRaf);
      viewRaf = 0;
    }
  };
}

export function useViewport(): ViewportState {
  return useSyncExternalStore(subscribeView, () => view, () => SERVER_VIEW);
}

/** Re-measure now (e.g. after a route change swapped the sections). */
export function refreshViewport(): void {
  if (typeof window !== "undefined") scheduleView();
}

export function ruleActive(rule: ScopeRule, v: ViewportState): boolean {
  switch (rule.scope) {
    case "global":
      return true;
    case "hero":
      return v.inHero;
    case "sections":
      return !v.inHero;
    case "specific":
      return v.section !== null && rule.sections.includes(v.section);
  }
}

/** True while effect `id` is switched on AND its scope covers what's on screen. */
export function useEffectActive(id: EffectId): boolean {
  const c = useCinematic();
  const v = useViewport();
  return effectOn(c, id) && ruleActive(scopeOf(c, id), v);
}

/* ------------------------------------------------------------------ */
/* Scroll velocity — one rAF loop, only while something listens        */
/* ------------------------------------------------------------------ */
type VelocityFn = (pxPerFrame: number) => void;
const velocityListeners = new Set<VelocityFn>();
let velRaf = 0;
let lastY = 0;
let lastT = 0;

function velocityLoop(t: number) {
  velRaf = requestAnimationFrame(velocityLoop);
  const y = window.scrollY;
  const dt = lastT ? Math.max(1, t - lastT) : 16.7;
  // Normalised to a 60fps frame so thresholds read the same on 120Hz screens.
  const v = ((y - lastY) / dt) * 16.7;
  lastY = y;
  lastT = t;
  for (const l of velocityListeners) l(v);
}

export function useScrollVelocity(fn: VelocityFn, enabled = true): void {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!enabled) return;
    const l: VelocityFn = (v) => ref.current(v);
    velocityListeners.add(l);
    if (velocityListeners.size === 1) {
      lastY = window.scrollY;
      lastT = 0;
      velRaf = requestAnimationFrame(velocityLoop);
    }
    return () => {
      velocityListeners.delete(l);
      if (!velocityListeners.size) {
        cancelAnimationFrame(velRaf);
        velRaf = 0;
      }
    };
  }, [enabled]);
}

/* ------------------------------------------------------------------ */
/* FX bus — page transitions, glitch hits, UI sounds                   */
/* ------------------------------------------------------------------ */
export type FxEvent = "transition";
const FX_EVENT = "3skrino:fx";
const SOUND_EVENT = "3skrino:ui-sound";

export function emitFx(type: FxEvent): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<FxEvent>(FX_EVENT, { detail: type }));
}

export function useFxEvent(type: FxEvent, cb: () => void, enabled = true): void {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  useEffect(() => {
    if (!enabled) return;
    const on = (e: Event) => {
      if (e instanceof CustomEvent && e.detail === type) ref.current();
    };
    window.addEventListener(FX_EVENT, on);
    return () => window.removeEventListener(FX_EVENT, on);
  }, [type, enabled]);
}

/** Ask the sound layer for a UI sound (it decides whether one actually plays). */
export function uiSound(name: SoundName): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SoundName>(SOUND_EVENT, { detail: name }));
}

export function useUiSoundRequests(cb: (name: SoundName) => void, enabled = true): void {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  useEffect(() => {
    if (!enabled) return;
    const on = (e: Event) => {
      if (e instanceof CustomEvent && typeof e.detail === "string") ref.current(e.detail as SoundName);
    };
    window.addEventListener(SOUND_EVENT, on);
    return () => window.removeEventListener(SOUND_EVENT, on);
  }, [enabled]);
}

/** Resolves a cursor / hover colour token to CSS. */
export function colorCss(token: string): string {
  if (token === "accent") return "var(--accent)";
  if (token === "white") return "#ffffff";
  return /^#[0-9a-f]{6}$/i.test(token) ? token : "var(--accent)";
}
