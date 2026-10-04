import {
  ASPECT_RATIOS,
  CURSOR_SIZES,
  CURSOR_STYLES,
  DEFAULT_CINEMATIC,
  EFFECT_IDS,
  EFFECT_SCOPES,
  ENTRY_ANIMATIONS,
  HERO_VARIANTS,
  LUT_PRESETS,
  SOUND_NAMES,
} from "@/data/cinematic-defaults";
import type {
  CinematicConfig,
  CinematicEffects,
  EffectId,
  HeroVariant,
  LutPreset,
  ScopeRule,
  SectionFx,
  SectionId,
  SoundName,
  SoundSlot,
} from "@/data/site-config";
import { bezierCss, EASE_KEYWORDS, parseEasing } from "@/lib/easing";
import { asset, bool, fail, HEX, num, oneOf, rec, SLUG } from "./config-file";

/**
 * Validation for the Sprint 10 fields of data/site-config.ts (heroVariant +
 * cinematic). Every key falls back to its factory default when missing, so
 * older files and backups keep loading; a key that IS present must be valid.
 */

const SECTION_IDS: readonly SectionId[] = ["marquee", "vertical", "horizontal", "fields", "ai", "about", "contact"];

/** A nested object, or {} when absent (so every child key takes its fallback). */
function sub(o: Record<string, unknown>, k: string, what: string): Record<string, unknown> {
  return o[k] === undefined ? {} : rec(o[k], `${what}.${k}`);
}

/** "accent", "white" or a #hex. */
function colorToken(o: Record<string, unknown>, k: string, what: string, fallback: string): string {
  const v = o[k];
  if (v === undefined) return fallback;
  if (typeof v !== "string") return fail(`${what}: "${k}" must be text`);
  const t = v.trim().toLowerCase();
  if (t === "accent" || t === "white" || HEX.test(t)) return t;
  return fail(`${what}: "${k}" must be accent, white or a hex colour`);
}

function easing(o: Record<string, unknown>, what: string): string {
  const v = o.easing;
  if (v === undefined) return DEFAULT_CINEMATIC.motion.easing;
  if (typeof v !== "string") return fail(`${what}: "easing" must be text`);
  const t = v.trim().toLowerCase().replace(/\s+/g, " ");
  if (t in EASE_KEYWORDS) return t;
  const p = parseEasing(t);
  if (!p) return fail(`${what}: "easing" must be a cubic-bezier(x1, y1, x2, y2) with x in 0–1, or a CSS keyword`);
  return bezierCss(p);
}

function effects(input: Record<string, unknown>): CinematicEffects {
  const d = DEFAULT_CINEMATIC.effects;
  const W = "Effects";
  const e = (k: EffectId) => sub(input, k, W);
  const on = (o: Record<string, unknown>, k: EffectId) => bool(o, "enabled", `${W}.${k}`, d[k].enabled);

  const fg = e("filmGrain");
  const ca = e("chromatic");
  const vhs = e("vhs");
  const crt = e("crt");
  const burn = e("filmBurn");
  const leaks = e("lightLeaks");
  const gl = e("glitch");
  const bars = e("bars");
  const lut = e("lut");
  const shake = e("cameraShake");
  const dof = e("depthOfField");
  const mb = e("motionBlur");
  const hal = e("halation");
  const bloom = e("bloom");
  const lb = e("letterbox");
  const tr = e("timeRemap");
  const sf = e("shutterFlash");
  const sc = e("filmScratch");

  return {
    filmGrain: {
      enabled: on(fg, "filmGrain"),
      intensity: num(fg, "intensity", W, 0, 0.3, 0.005, d.filmGrain.intensity),
      flicker: num(fg, "flicker", W, 1, 24, 1, d.filmGrain.flicker),
      dust: num(fg, "dust", W, 0, 1, 0.01, d.filmGrain.dust),
    },
    chromatic: {
      enabled: on(ca, "chromatic"),
      strength: num(ca, "strength", W, 0, 1, 0.01, d.chromatic.strength),
      breathing: bool(ca, "breathing", W, d.chromatic.breathing),
    },
    vhs: {
      enabled: on(vhs, "vhs"),
      scanlines: num(vhs, "scanlines", W, 0, 1, 0.01, d.vhs.scanlines),
      tracking: num(vhs, "tracking", W, 0, 1, 0.01, d.vhs.tracking),
      bleeding: num(vhs, "bleeding", W, 0, 1, 0.01, d.vhs.bleeding),
    },
    crt: {
      enabled: on(crt, "crt"),
      curve: num(crt, "curve", W, 0, 1, 0.01, d.crt.curve),
      glow: num(crt, "glow", W, 0, 1, 0.01, d.crt.glow),
      trails: num(crt, "trails", W, 0, 1, 0.01, d.crt.trails),
    },
    filmBurn: {
      enabled: on(burn, "filmBurn"),
      intensity: num(burn, "intensity", W, 0, 1, 0.01, d.filmBurn.intensity),
      duration: num(burn, "duration", W, 0.3, 2, 0.05, d.filmBurn.duration),
    },
    lightLeaks: {
      enabled: on(leaks, "lightLeaks"),
      ambient: bool(leaks, "ambient", W, d.lightLeaks.ambient),
      hover: bool(leaks, "hover", W, d.lightLeaks.hover),
    },
    glitch: {
      enabled: on(gl, "glitch"),
      strength: num(gl, "strength", W, 0, 1, 0.01, d.glitch.strength),
      frequency: num(gl, "frequency", W, 0, 1, 0.01, d.glitch.frequency),
      blockSize: num(gl, "blockSize", W, 4, 80, 1, d.glitch.blockSize),
    },
    bars: {
      enabled: on(bars, "bars"),
      height: num(bars, "height", W, 2, 16, 0.5, d.bars.height),
      opacity: num(bars, "opacity", W, 0, 1, 0.01, d.bars.opacity),
      hideOnScroll: bool(bars, "hideOnScroll", W, d.bars.hideOnScroll),
    },
    lut: { enabled: on(lut, "lut"), preset: oneOf(lut, "preset", W, LUT_PRESETS, d.lut.preset) },
    cameraShake: {
      enabled: on(shake, "cameraShake"),
      intensity: num(shake, "intensity", W, 0, 1, 0.01, d.cameraShake.intensity),
      threshold: num(shake, "threshold", W, 10, 120, 1, d.cameraShake.threshold),
    },
    depthOfField: {
      enabled: on(dof, "depthOfField"),
      intensity: num(dof, "intensity", W, 0, 12, 0.5, d.depthOfField.intensity),
      mode: oneOf(dof, "mode", W, ["center", "cursor"] as const, d.depthOfField.mode),
    },
    motionBlur: { enabled: on(mb, "motionBlur"), strength: num(mb, "strength", W, 0, 1, 0.01, d.motionBlur.strength) },
    halation: { enabled: on(hal, "halation"), strength: num(hal, "strength", W, 0, 1, 0.01, d.halation.strength) },
    bloom: {
      enabled: on(bloom, "bloom"),
      intensity: num(bloom, "intensity", W, 0, 1, 0.01, d.bloom.intensity),
      threshold: num(bloom, "threshold", W, 0, 1, 0.01, d.bloom.threshold),
    },
    letterbox: { enabled: on(lb, "letterbox"), ratio: oneOf(lb, "ratio", W, ASPECT_RATIOS, d.letterbox.ratio) },
    timeRemap: { enabled: on(tr, "timeRemap"), strength: num(tr, "strength", W, 0, 1, 0.01, d.timeRemap.strength) },
    shutterFlash: { enabled: on(sf, "shutterFlash") },
    filmScratch: { enabled: on(sc, "filmScratch"), density: num(sc, "density", W, 0, 1, 0.01, d.filmScratch.density) },
  };
}

function sectionList(v: unknown, what: string): SectionId[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return fail(`${what} must be a list`);
  return [...new Set(v.filter((s): s is SectionId => typeof s === "string" && (SECTION_IDS as readonly string[]).includes(s)))];
}

function scopes(input: Record<string, unknown>): Partial<Record<EffectId, ScopeRule>> {
  const out: Partial<Record<EffectId, ScopeRule>> = {};
  for (const [k, v] of Object.entries(input)) {
    if (!(EFFECT_IDS as readonly string[]).includes(k)) continue; // unknown effect → dropped
    const o = rec(v, `Scope for ${k}`);
    out[k as EffectId] = {
      scope: oneOf(o, "scope", `Scope for ${k}`, EFFECT_SCOPES, "global"),
      sections: sectionList(o.sections, `Scope for ${k}: sections`),
    };
  }
  return out;
}

function sections(input: Record<string, unknown>): Partial<Record<SectionId, SectionFx>> {
  const out: Partial<Record<SectionId, SectionFx>> = {};
  for (const [k, v] of Object.entries(input)) {
    if (!(SECTION_IDS as readonly string[]).includes(k)) continue;
    const what = `Section ${k}`;
    const o = rec(v, what);
    const fx: SectionFx = {};
    if (o.entry !== undefined) fx.entry = oneOf(o, "entry", what, ENTRY_ANIMATIONS);
    if (o.letterbox !== undefined) fx.letterbox = oneOf(o, "letterbox", what, ASPECT_RATIOS);
    if (o.lut !== undefined) fx.lut = oneOf(o, "lut", what, LUT_PRESETS);
    if (o.crt !== undefined) fx.crt = bool(o, "crt", what);
    if (o.chromatic !== undefined) fx.chromatic = num(o, "chromatic", what, 0, 1);
    if (o.dof !== undefined) fx.dof = num(o, "dof", what, 0, 12, 0.5);
    if (Object.keys(fx).length) out[k as SectionId] = fx;
  }
  return out;
}

function lutProjects(input: Record<string, unknown>): Record<string, LutPreset> {
  const out: Record<string, LutPreset> = {};
  for (const [id, v] of Object.entries(input)) {
    if (!SLUG.test(id)) fail(`Project grade: "${id}" isn't a project id`);
    if (typeof v !== "string" || !(LUT_PRESETS as readonly string[]).includes(v)) fail(`Project grade for ${id} must be a LUT preset`);
    out[id] = v as LutPreset;
  }
  if (Object.keys(out).length > 500) fail("Too many per-project grades");
  return out;
}

function sound(input: Record<string, unknown>): CinematicConfig["sound"] {
  const d = DEFAULT_CINEMATIC.sound;
  const W = "Sound";
  const s = sub(input, "sounds", W);
  const slots = {} as Record<SoundName, SoundSlot>;
  for (const name of SOUND_NAMES) {
    const o = sub(s, name, `${W}.sounds`);
    const what = `Sound "${name}"`;
    slots[name] = {
      enabled: bool(o, "enabled", what, d.sounds[name].enabled),
      volume: num(o, "volume", what, 0, 100, 1, d.sounds[name].volume),
      src: o.src === undefined ? "" : asset(o, "src", what, false),
    };
  }
  return {
    enabled: bool(input, "enabled", W, d.enabled),
    volume: num(input, "volume", W, 0, 100, 1, d.volume),
    sounds: slots,
  };
}

export function validateHeroVariant(o: Record<string, unknown>): HeroVariant {
  return oneOf(o, "heroVariant", "Hero variant", HERO_VARIANTS, "cinematic");
}

export function validateCinematic(v: unknown): CinematicConfig {
  const d = DEFAULT_CINEMATIC;
  const o = v === undefined ? {} : rec(v, "cinematic");
  const c = sub(o, "cursor", "cinematic");
  const trail = sub(c, "trail", "Cursor");
  const hover = sub(c, "hover", "Cursor");
  const m = sub(o, "motion", "cinematic");
  const x = sub(o, "experiments", "cinematic");
  const h = sub(o, "heroOptions", "cinematic");
  const X = "Experiments";

  const splitReel = h.splitReel === undefined ? "" : typeof h.splitReel === "string" ? h.splitReel.trim() : fail("Split hero reel must be a project id");
  if (splitReel && !SLUG.test(splitReel)) fail("Split hero reel must be a project id");

  return {
    effects: effects(sub(o, "effects", "cinematic")),
    scopes: scopes(sub(o, "scopes", "cinematic")),
    lutProjects: lutProjects(sub(o, "lutProjects", "cinematic")),
    sections: sections(sub(o, "sections", "cinematic")),
    cursor: {
      size: oneOf(c, "size", "Cursor", CURSOR_SIZES, d.cursor.size),
      style: oneOf(c, "style", "Cursor", CURSOR_STYLES, d.cursor.style),
      color: colorToken(c, "color", "Cursor", d.cursor.color),
      trail: {
        enabled: bool(trail, "enabled", "Cursor trail", d.cursor.trail.enabled),
        length: num(trail, "length", "Cursor trail", 2, 24, 1, d.cursor.trail.length),
      },
      hover: {
        scale: num(hover, "scale", "Cursor hover", 1, 3, 0.05, d.cursor.hover.scale),
        color: colorToken(hover, "color", "Cursor hover", d.cursor.hover.color),
        glow: bool(hover, "glow", "Cursor hover", d.cursor.hover.glow),
      },
    },
    sound: sound(sub(o, "sound", "cinematic")),
    motion: {
      speed: num(m, "speed", "Motion", 0.5, 2, 0.05, d.motion.speed),
      entry: oneOf(m, "entry", "Motion", ENTRY_ANIMATIONS, d.motion.entry),
      hover: num(m, "hover", "Motion", 80, 1200, 10, d.motion.hover),
      easing: easing(m, "Motion"),
    },
    experiments: {
      vhs: bool(x, "vhs", X, false),
      crt: bool(x, "crt", X, false),
      filmBurn: bool(x, "filmBurn", X, false),
      letterbox: bool(x, "letterbox", X, false),
      timeRemap: bool(x, "timeRemap", X, false),
      shutterFlash: bool(x, "shutterFlash", X, false),
      filmScratch: bool(x, "filmScratch", X, false),
    },
    heroOptions: {
      splitReel,
      galleryCount: num(h, "galleryCount", "Hero options", 12, 36, 1, d.heroOptions.galleryCount),
      mirrorCount: num(h, "mirrorCount", "Hero options", 5, 7, 1, d.heroOptions.mirrorCount),
      timelineAutoplay: bool(h, "timelineAutoplay", "Hero options", d.heroOptions.timelineAutoplay),
    },
  };
}
