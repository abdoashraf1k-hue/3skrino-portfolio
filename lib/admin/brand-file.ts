import type { BrandConfig, BrandIcon, BrandPalette, CategoryDef, IconSource } from "@/data/brand";
import { NUMBER_BY_KEY } from "@/data/number-registry";
import { TEXT_BY_KEY } from "@/data/text-registry";
import {
  asset,
  bool,
  fail,
  HEX,
  hex,
  num,
  oneOf,
  parseConfigSource,
  readConfig,
  rec,
  SLUG,
  text,
  writeConfig,
  writeConfigSource,
  type ConfigSpec,
} from "./config-file";

/** data/brand.ts — identity, voice, tokens, palettes, categories, text, numbers, icons. */

export const BRAND_PATH = "data/brand.ts";
export const ICON_SOURCES: readonly IconSource[] = ["lucide", "heroicons", "upload", "glyph"];
/** A CSS easing the runtime can paste into a custom property safely. */
const EASING = /^(?:linear|ease|ease-in|ease-out|ease-in-out|cubic-bezier\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\))$/;

function list(v: unknown, what: string, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v) || !v.every((s): s is string => typeof s === "string")) return fail(`${what} must be a list of text`);
  const out = v.map((s) => s.trim()).filter(Boolean);
  if (out.length > maxItems) fail(`${what}: at most ${maxItems}`);
  if (out.some((s) => s.length > maxLen)) fail(`${what}: each must be ${maxLen} characters or fewer`);
  return out;
}

function easing(o: Record<string, unknown>, k: string, what: string): string {
  const v = text(o, k, what, 80);
  if (!EASING.test(v)) fail(`${what}: "${k}" must be a keyword or cubic-bezier(a, b, c, d)`);
  return v;
}

function colorMap(v: unknown, what: string): Record<string, string> {
  const o = v === undefined ? {} : rec(v, what);
  const out: Record<string, string> = {};
  for (const id of Object.keys(o)) {
    if (!SLUG.test(id)) fail(`${what}: "${id}" is not a category id`);
    out[id] = hex(o, id, what);
  }
  return out;
}

function palette(v: unknown, i: number): BrandPalette {
  const what = `Palette #${i + 1}`;
  const o = rec(v, what);
  const id = text(o, "id", what, 40);
  if (!SLUG.test(id)) fail(`${what}: id must be a lowercase slug`);
  return {
    id,
    name: text(o, "name", what, 40),
    bg: hex(o, "bg", what),
    bgSoft: hex(o, "bgSoft", what),
    fg: hex(o, "fg", what),
    accent: hex(o, "accent", what),
    accent2: hex(o, "accent2", what),
    categoryColors: colorMap(o.categoryColors, `${what} category colours`),
  };
}

function category(v: unknown, i: number): CategoryDef {
  const what = `Category #${i + 1}`;
  const o = rec(v, what);
  const id = text(o, "id", what, 40);
  if (!SLUG.test(id)) fail(`${what}: slug must be lowercase letters, digits and dashes`);
  return {
    id,
    name: text(o, "name", what, 40),
    description: text(o, "description", what, 300, false),
    color: hex(o, "color", what),
    emoji: text(o, "emoji", what, 8, false),
    enabled: bool(o, "enabled", what, true),
  };
}

function icon(v: unknown, i: number): BrandIcon {
  const what = `Icon #${i + 1}`;
  const o = rec(v, what);
  const id = text(o, "id", what, 40);
  if (!SLUG.test(id)) fail(`${what}: id must be a lowercase slug`);
  const source = oneOf(o, "source", what, ICON_SOURCES);
  const value = source === "glyph" ? text(o, "value", what, 8) : asset(o, "value", what);
  return { id, name: text(o, "name", what, 40), source, value };
}

/** Overrides for registered keys only; values equal to nothing are dropped. */
function textOverrides(v: unknown): Record<string, string> {
  const o = v === undefined ? {} : rec(v, "text");
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(o)) {
    if (!TEXT_BY_KEY.has(k)) continue; // a key the code no longer reads — drop it quietly
    if (typeof val !== "string") fail(`Text "${k}" must be text`);
    const t = (val as string).trim();
    if (t.length > 2000) fail(`Text "${k}" is too long (max 2000)`);
    if (t) out[k] = t;
  }
  return out;
}

function numberOverrides(v: unknown): Record<string, number> {
  const o = v === undefined ? {} : rec(v, "numbers");
  const out: Record<string, number> = {};
  for (const k of Object.keys(o)) {
    const entry = NUMBER_BY_KEY.get(k);
    if (!entry) continue;
    out[k] = num(o, k, `Number "${entry.label}"`, entry.min, entry.max, entry.step);
  }
  return out;
}

export function validateBrandConfig(input: unknown): BrandConfig {
  const o = rec(input, "Brand config");

  const id = rec(o.identity, "identity");
  const I = "Identity";
  const logos = rec(id.logos ?? {}, "identity.logos");
  const identity = {
    name: text(id, "name", I, 40),
    tagline: text(id, "tagline", I, 140, false),
    mission: text(id, "mission", I, 400, false),
    logos: { primary: asset(logos, "primary", I, false), mark: asset(logos, "mark", I, false), mono: asset(logos, "mono", I, false) },
  };

  const vo = rec(o.voice, "voice");
  const voice = {
    summary: text(vo, "summary", "Voice", 400, false),
    traits: list(vo.traits ?? [], "Voice traits", 12, 60),
    do: list(vo.do ?? [], "Voice — do", 20, 200),
    dont: list(vo.dont ?? [], "Voice — don't", 20, 200),
  };

  const s = rec(o.scale, "scale");
  const S = "Scale";
  if (!Array.isArray(s.steps) || !s.steps.every((n): n is number => typeof n === "number" && Number.isFinite(n))) fail("Scale: steps must be numbers");
  const steps = (s.steps as number[]).map((n) => Math.round(Math.min(64, Math.max(0, n)) * 100) / 100);
  if (steps.length < 4 || steps.length > 16) fail("Scale: 4–16 spacing steps");
  const r = rec(s.radius, "scale.radius");
  const g = rec(s.grid, "scale.grid");
  const scale = {
    unit: num(s, "unit", S, 2, 12, 1),
    steps,
    typeBase: num(s, "typeBase", S, 12, 22, 0.5),
    typeRatio: num(s, "typeRatio", S, 1.1, 1.618, 0.001),
    radius: { sm: num(r, "sm", S, 0, 40, 1), md: num(r, "md", S, 0, 40, 1), lg: num(r, "lg", S, 0, 60, 1) },
    grid: { columns: num(g, "columns", S, 4, 24, 1), gutter: num(g, "gutter", S, 0, 80, 1), maxWidth: num(g, "maxWidth", S, 960, 2560, 10) },
  };

  const m = rec(o.motion, "motion");
  const M = "Motion";
  const motion = {
    fast: num(m, "fast", M, 40, 600, 10),
    base: num(m, "base", M, 80, 1200, 10),
    slow: num(m, "slow", M, 200, 2400, 10),
    cinematic: num(m, "cinematic", M, 400, 4000, 50),
    ease: easing(m, "ease", M),
    easeInOut: easing(m, "easeInOut", M),
    principles: list(m.principles ?? [], "Motion principles", 12, 200),
  };

  const st = rec(o.states, "states");
  const states = {
    hoverLift: num(st, "hoverLift", "States", 0, 8, 0.5),
    pressScale: num(st, "pressScale", "States", 0.9, 1, 0.005),
    focusWidth: num(st, "focusWidth", "States", 1, 4, 0.5),
    focusOffset: num(st, "focusOffset", "States", 0, 6, 0.5),
  };

  const pa = rec(o.palettes, "palettes");
  if (!Array.isArray(pa.items)) fail("palettes.items must be a list");
  const items = (pa.items as unknown[]).map(palette);
  if (!items.length || items.length > 24) fail("Keep 1–24 palettes");
  if (new Set(items.map((p) => p.id)).size !== items.length) fail("Palette ids must be unique");
  const active = typeof pa.active === "string" && items.some((p) => p.id === pa.active) ? pa.active : items[0].id;

  const pr = rec(o.principles ?? {}, "principles");
  const principles = { iconography: text(pr, "iconography", "Principles", 600, false), imagery: text(pr, "imagery", "Principles", 600, false) };

  const sg = rec(o.signature ?? {}, "signature");
  const signature = {
    slateWipe: bool(sg, "slateWipe", "Signature", true),
    magneticCtas: bool(sg, "magneticCtas", "Signature", true),
    scrollTimecode: bool(sg, "scrollTimecode", "Signature", true),
    leaderCountdown: bool(sg, "leaderCountdown", "Signature", false),
    rackFocus: bool(sg, "rackFocus", "Signature", true),
  };

  if (!Array.isArray(o.categories)) fail("categories must be a list");
  const categories = (o.categories as unknown[]).map(category);
  if (!categories.length) fail("Keep at least one category");
  if (categories.length > 40) fail("At most 40 categories");
  if (new Set(categories.map((c) => c.id)).size !== categories.length) fail("Category slugs must be unique");

  if (o.icons !== undefined && !Array.isArray(o.icons)) fail("icons must be a list");
  const icons = ((o.icons as unknown[] | undefined) ?? []).map(icon);
  if (icons.length > 200) fail("At most 200 icons");
  if (new Set(icons.map((x) => x.id)).size !== icons.length) fail("Icon ids must be unique");

  return {
    identity,
    voice,
    scale,
    motion,
    states,
    palettes: { active, items },
    principles,
    signature,
    categories,
    text: textOverrides(o.text),
    numbers: numberOverrides(o.numbers),
    icons,
  };
}

/** Re-exported so callers validating hex outside a record agree with the files. */
export const isHex = (v: string) => HEX.test(v);

export const BRAND_SPEC: ConfigSpec<BrandConfig> = {
  target: "brand",
  path: BRAND_PATH,
  start: /export const brandConfig\s*:\s*BrandConfig\s*=\s*/,
  validate: validateBrandConfig,
};

export const parseBrandFile = (source: string) => parseConfigSource(BRAND_SPEC, source);
export const writeBrandFile = (source: string, config: BrandConfig) => writeConfigSource(BRAND_SPEC, source, config);
export const readBrand = () => readConfig(BRAND_SPEC);
export const writeBrand = (input: unknown, message = "admin: update brand") => writeConfig(BRAND_SPEC, input, message);
