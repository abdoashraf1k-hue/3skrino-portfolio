"use client";

import { create } from "zustand";
import type { Hero3DConfig, Hero3DTheme, HeroFloatingType } from "@/data/hero-config";
import { DEFAULT_MODEL3D } from "@/data/hero-defaults";

/**
 * Sprint 13 — transient state for the 3D hero. The scene reads it inside
 * useFrame with `useHeroStore.getState()` (no React re-render at 60 fps):
 * colours and the turntable speed ease towards whatever is here every frame.
 * Only structural changes (floatingType, count, regenerateKey) are subscribed
 * to with selectors, since they rebuild the instanced orbit.
 *
 * The store is hydrated from the hero config (committed file, or the admin's
 * unsaved draft inside the live-preview iframe), so admin edits land here
 * immediately and survive a save as data/hero-config.ts → model3d.
 */

export type HeroState = {
  theme: Hero3DTheme;
  floatingType: HeroFloatingType;
  rotateSpeed: number;
  count: number;
  /** Seeds the orbit layout; a new value re-randomises radii, speeds and phases. */
  regenerateKey: number;
  postFx: boolean;
  setTheme: (theme: Hero3DTheme) => void;
  setFloatingType: (type: HeroFloatingType) => void;
  setRotateSpeed: (speed: number) => void;
  /** A fresh random orbit. */
  regenerate: () => void;
  /** Adopt a (validated) config — only the fields that changed are written. */
  hydrate: (config: Hero3DConfig) => void;
};

const sameTheme = (a: Hero3DTheme, b: Hero3DTheme) => a.primary === b.primary && a.secondary === b.secondary && a.background === b.background;

export const randomSeed = () => 1 + Math.floor(Math.random() * 2_147_483_646);

export const useHeroStore = create<HeroState>()((set, get) => ({
  theme: DEFAULT_MODEL3D.theme,
  floatingType: DEFAULT_MODEL3D.floatingType,
  rotateSpeed: DEFAULT_MODEL3D.rotateSpeed,
  count: DEFAULT_MODEL3D.count,
  regenerateKey: DEFAULT_MODEL3D.seed,
  postFx: DEFAULT_MODEL3D.postFx,
  setTheme: (theme) => set({ theme }),
  setFloatingType: (floatingType) => set({ floatingType }),
  setRotateSpeed: (rotateSpeed) => set({ rotateSpeed }),
  regenerate: () => set({ regenerateKey: randomSeed() }),
  hydrate: (c) => {
    const s = get();
    const patch: Partial<HeroState> = {};
    if (!sameTheme(s.theme, c.theme)) patch.theme = c.theme;
    if (s.floatingType !== c.floatingType) patch.floatingType = c.floatingType;
    if (s.rotateSpeed !== c.rotateSpeed) patch.rotateSpeed = c.rotateSpeed;
    if (s.count !== c.count) patch.count = c.count;
    if (s.regenerateKey !== c.seed) patch.regenerateKey = c.seed;
    if (s.postFx !== c.postFx) patch.postFx = c.postFx;
    if (Object.keys(patch).length) set(patch);
  },
}));

/**
 * The image sequence's eased turn (radians, 0 … 2π per full rotation), written
 * by ImageSequenceHero every frame it moves and read by the WebGL orbit inside
 * useFrame — a plain mutable object, so 60 fps writes never touch React or
 * Zustand subscribers.
 */
export const heroSpin = { angle: 0 };
