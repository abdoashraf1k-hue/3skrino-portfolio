import type {
  AspectRatio,
  CinematicConfig,
  CinematicEffects,
  CursorSize,
  CursorStyle,
  EffectId,
  EffectScope,
  EntryAnimation,
  HeroVariant,
  LutPreset,
  ScopeRule,
  SoundName,
} from "./site-config";

/**
 * Factory settings for the Sprint 10 cinematic toolbox — what every "Reset"
 * in the admin goes back to. Kept apart from data/site-config.ts, which the
 * admin rewrites. Every effect ships OFF, and the cursor / motion defaults
 * reproduce the site exactly as it looked before Sprint 10.
 */

export const HERO_VARIANTS: readonly HeroVariant[] = ["cinematic", "split", "gallery", "timeline", "mirror"];
export const LUT_PRESETS: readonly LutPreset[] = ["none", "teal-orange", "bleach", "kodak", "noir", "warm", "cool", "vintage"];
export const ASPECT_RATIOS: readonly AspectRatio[] = ["2.39:1", "16:9", "4:3", "1:1"];
export const EFFECT_SCOPES: readonly EffectScope[] = ["global", "hero", "sections", "specific"];
export const CURSOR_SIZES: readonly CursorSize[] = ["sm", "md", "lg"];
export const CURSOR_STYLES: readonly CursorStyle[] = ["dot", "ring", "crosshair", "playhead", "aperture"];
export const SOUND_NAMES: readonly SoundName[] = ["hover", "click", "transition", "notification", "error", "success"];
export const ENTRY_ANIMATIONS: readonly EntryAnimation[] = ["fade", "slide", "scale", "blur"];

export const EFFECT_IDS: readonly EffectId[] = [
  "filmGrain",
  "chromatic",
  "vhs",
  "crt",
  "filmBurn",
  "lightLeaks",
  "glitch",
  "bars",
  "lut",
  "cameraShake",
  "depthOfField",
  "motionBlur",
  "halation",
  "bloom",
  "letterbox",
  "timeRemap",
  "shutterFlash",
  "filmScratch",
];

/** Effects that only ever run on page transitions or as a page-wide layer — no scope selector. */
export const UNSCOPED_EFFECTS: ReadonlySet<EffectId> = new Set<EffectId>(["filmBurn", "shutterFlash", "timeRemap"]);

/** Where each effect runs until the admin says otherwise. Film scratches live on the hero. */
export const EFFECT_DEFAULT_SCOPE: Record<EffectId, EffectScope> = {
  filmGrain: "global",
  chromatic: "global",
  vhs: "global",
  crt: "global",
  filmBurn: "global",
  lightLeaks: "global",
  glitch: "global",
  bars: "global",
  lut: "global",
  cameraShake: "global",
  depthOfField: "sections",
  motionBlur: "global",
  halation: "global",
  bloom: "global",
  letterbox: "global",
  timeRemap: "global",
  shutterFlash: "global",
  filmScratch: "hero",
};

export function defaultScope(id: EffectId): ScopeRule {
  return { scope: EFFECT_DEFAULT_SCOPE[id], sections: [] };
}

export const DEFAULT_EFFECTS: CinematicEffects = {
  filmGrain: { enabled: false, intensity: 0.08, flicker: 12, dust: 0.3 },
  chromatic: { enabled: false, strength: 0.35, breathing: true },
  vhs: { enabled: false, scanlines: 0.5, tracking: 0.4, bleeding: 0.3 },
  crt: { enabled: false, curve: 0.5, glow: 0.4, trails: 0.3 },
  filmBurn: { enabled: false, intensity: 0.7, duration: 0.9 },
  lightLeaks: { enabled: false, ambient: true, hover: true },
  glitch: { enabled: false, strength: 0.4, frequency: 0.25, blockSize: 24 },
  bars: { enabled: false, height: 8, opacity: 1, hideOnScroll: true },
  lut: { enabled: false, preset: "none" },
  cameraShake: { enabled: false, intensity: 0.4, threshold: 60 },
  depthOfField: { enabled: false, intensity: 4, mode: "center" },
  motionBlur: { enabled: false, strength: 0.4 },
  halation: { enabled: false, strength: 0.4 },
  bloom: { enabled: false, intensity: 0.4, threshold: 0.7 },
  letterbox: { enabled: false, ratio: "2.39:1" },
  timeRemap: { enabled: false, strength: 0.4 },
  shutterFlash: { enabled: false },
  filmScratch: { enabled: false, density: 0.4 },
};

const synth = { volume: 60, src: "" };

/** Matches the pre-Sprint-10 easing of every scroll reveal (GSAP "reveal"). */
export const DEFAULT_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

export const DEFAULT_CINEMATIC: CinematicConfig = {
  effects: DEFAULT_EFFECTS,
  scopes: {},
  lutProjects: {},
  sections: {},
  cursor: {
    size: "md",
    style: "dot",
    color: "accent",
    trail: { enabled: false, length: 8 },
    hover: { scale: 1, color: "accent", glow: false },
  },
  sound: {
    enabled: false,
    volume: 70,
    sounds: {
      hover: { enabled: true, ...synth, volume: 35 },
      click: { enabled: true, ...synth },
      transition: { enabled: true, ...synth },
      notification: { enabled: true, ...synth },
      error: { enabled: true, ...synth },
      success: { enabled: true, ...synth },
    },
  },
  motion: { speed: 1, entry: "slide", hover: 300, easing: DEFAULT_EASING },
  experiments: {
    vhs: false,
    crt: false,
    filmBurn: false,
    letterbox: false,
    timeRemap: false,
    shutterFlash: false,
    filmScratch: false,
  },
  heroOptions: { splitReel: "", galleryCount: 30, mirrorCount: 7, timelineAutoplay: true },
};

/** Experiments are a quick on-switch for these effects (on if either the effect or the experiment is on). */
export const EXPERIMENT_EFFECT: Record<keyof CinematicConfig["experiments"], EffectId> = {
  vhs: "vhs",
  crt: "crt",
  filmBurn: "filmBurn",
  letterbox: "letterbox",
  timeRemap: "timeRemap",
  shutterFlash: "shutterFlash",
  filmScratch: "filmScratch",
};

export const ASPECT_VALUE: Record<AspectRatio, number> = { "2.39:1": 2.39, "16:9": 16 / 9, "4:3": 4 / 3, "1:1": 1 };

/**
 * Fills any Sprint 10 field a site config is missing (an import of an older
 * export, a pre-Sprint-10 backup) so the admin tabs and FX layer can rely on
 * them. The server's validator does the same on save.
 */
export function withCinematicDefaults<T extends { heroVariant?: HeroVariant; cinematic?: Partial<CinematicConfig> }>(site: T): T & { heroVariant: HeroVariant; cinematic: CinematicConfig } {
  const c = site.cinematic ?? {};
  return {
    ...site,
    heroVariant: site.heroVariant ?? "cinematic",
    cinematic: {
      ...DEFAULT_CINEMATIC,
      ...c,
      effects: { ...DEFAULT_EFFECTS, ...(c.effects ?? {}) },
      cursor: { ...DEFAULT_CINEMATIC.cursor, ...(c.cursor ?? {}) },
      sound: { ...DEFAULT_CINEMATIC.sound, ...(c.sound ?? {}), sounds: { ...DEFAULT_CINEMATIC.sound.sounds, ...(c.sound?.sounds ?? {}) } },
      motion: { ...DEFAULT_CINEMATIC.motion, ...(c.motion ?? {}) },
      experiments: { ...DEFAULT_CINEMATIC.experiments, ...(c.experiments ?? {}) },
      heroOptions: { ...DEFAULT_CINEMATIC.heroOptions, ...(c.heroOptions ?? {}) },
    },
  };
}
