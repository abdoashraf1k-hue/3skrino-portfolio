import { LADDER_SIZE, type BrandLogo, type HeroConfig, type HeroFilter, type HeroPose } from "@/data/hero-config";
import { DEFAULT_FEATURES } from "@/data/hero-defaults";
import {
  asset,
  bool,
  fail,
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

/** data/hero-config.ts — poses, logos, effects, roles. */

export const HERO_PATH = "data/hero-config.ts";
export const HERO_FILTERS: readonly HeroFilter[] = ["none", "warm", "cool", "vintage", "contrast"];

function pose(v: unknown, what: string): HeroPose {
  const o = rec(v, what);
  const id = text(o, "id", what, 40);
  if (!SLUG.test(id)) fail(`${what}: id must be a lowercase slug`);
  const out: HeroPose = { id, label: text(o, "label", what, 40), src: asset(o, "src", what), tint: hex(o, "tint", what) };
  if (o.offset !== undefined) {
    const off = o.offset;
    if (!Array.isArray(off) || off.length !== 2 || !off.every((n): n is number => typeof n === "number" && Number.isFinite(n))) {
      fail(`${what}: offset must be [x, y]`);
    }
    const [x, y] = (off as number[]).map((n) => Math.round(Math.min(0.15, Math.max(-0.15, n)) * 10000) / 10000);
    if (x !== 0 || y !== 0) out.offset = [x, y];
  }
  return out;
}

function logo(v: unknown, i: number): BrandLogo {
  const what = `Logo #${i + 1}`;
  const o = rec(v, what);
  const id = text(o, "id", what, 60);
  if (!SLUG.test(id)) fail(`${what}: id must be a lowercase slug`);
  const name = text(o, "name", what, 60);
  const imageUrl = asset(o, "imageUrl", what);
  const href = text(o, "href", what, 500, false);
  if (href && !/^https?:\/\/\S+$/.test(href)) fail(`${what}: link must be an http(s) URL`);
  if (o.size !== undefined && (typeof o.size !== "number" || !Number.isFinite(o.size))) fail(`${what}: size must be a number`);
  const size = typeof o.size === "number" ? Math.round(Math.min(80, Math.max(40, o.size))) : undefined;
  // Built in declaration order so the serialized file diffs cleanly.
  return { id, name, imageUrl, href: href || undefined, size, visible: bool(o, "visible", what) };
}

/** Validates an unknown value into a HeroConfig. Throws ProjectsFileError (400). */
export function validateHeroConfig(input: unknown): HeroConfig {
  const o = rec(input, "Hero config");

  const poses = rec(o.poses, "poses");
  if (!Array.isArray(poses.ladder) || poses.ladder.length !== LADDER_SIZE) {
    fail(`The pose ladder must have exactly ${LADDER_SIZE} poses`);
  }
  const ladder = (poses.ladder as unknown[]).map((p, i) => pose(p, `Ladder pose #${i + 1}`));
  const up = pose(poses.up, "Up pose");
  const down = pose(poses.down, "Down pose");
  const ids = [...ladder, up, down].map((p) => p.id);
  if (new Set(ids).size !== ids.length) fail("Pose ids must be unique");

  const logos = rec(o.logos, "logos");
  if (!Array.isArray(logos.items)) fail("logos.items must be a list");
  const items = (logos.items as unknown[]).map(logo);
  if (items.length > 24) fail("At most 24 logos");
  if (new Set(items.map((l) => l.id)).size !== items.length) fail("Logo ids must be unique");

  const f = rec(o.features, "features");
  const d = DEFAULT_FEATURES;
  const W = "Features";
  const features = {
    ambientSound: bool(f, "ambientSound", W),
    cinematicBars: bool(f, "cinematicBars", W),
    parallax: num(f, "parallax", W, 0, 1),
    reactiveLighting: bool(f, "reactiveLighting", W),
    cameraShake: bool(f, "cameraShake", W),
    glitch: bool(f, "glitch", W),
    chromaticAberration: num(f, "chromaticAberration", W, 0, 1),
    bloom: num(f, "bloom", W, 0, 1),
    // Sprint 9.2 switches default in when an older file doesn't have them.
    autoAlign: bool(f, "autoAlign", W, d.autoAlign),
    particles: bool(f, "particles", W, d.particles),
    particleIntensity: num(f, "particleIntensity", W, 0, 1, 0.01, d.particleIntensity),
    fog: bool(f, "fog", W, d.fog),
    lightRays: bool(f, "lightRays", W, d.lightRays),
    rayIntensity: num(f, "rayIntensity", W, 0, 1, 0.01, d.rayIntensity),
    depthOfField: bool(f, "depthOfField", W, d.depthOfField),
    filter: oneOf(f, "filter", W, HERO_FILTERS, d.filter),
    hueShift: bool(f, "hueShift", W, d.hueShift),
    cursorRipple: bool(f, "cursorRipple", W, d.cursorRipple),
  };

  const ambientSrc = asset(o, "ambientSrc", "Ambient sound", false);

  const roles = rec(o.roles, "roles");
  if (!Array.isArray(roles.items) || !roles.items.every((r): r is string => typeof r === "string")) {
    fail("Roles must be a list of text");
  }
  const roleItems = [...new Set((roles.items as string[]).map((r) => r.trim()).filter(Boolean))];
  if (!roleItems.length) fail("Add at least one role");
  if (roleItems.length > 20) fail("At most 20 roles");
  if (roleItems.some((r) => r.length > 32)) fail("Roles must be 32 characters or fewer");
  const interval = num(roles, "interval", "Roles", 1.5, 30, 0.1);

  return {
    poses: { ladder, up, down },
    logos: { enabled: bool(logos, "enabled", "Logos"), items },
    features,
    ambientSrc,
    roles: { items: roleItems, interval },
  };
}

export const HERO_SPEC: ConfigSpec<HeroConfig> = {
  target: "hero-config",
  path: HERO_PATH,
  start: /export const heroConfig\s*:\s*HeroConfig\s*=\s*/,
  validate: validateHeroConfig,
};

export const parseHeroFile = (source: string) => parseConfigSource(HERO_SPEC, source);
export const writeHeroFile = (source: string, config: HeroConfig) => writeConfigSource(HERO_SPEC, source, config);
export const readHero = () => readConfig(HERO_SPEC);
export const writeHero = (input: unknown, message = "admin: update hero settings") => writeConfig(HERO_SPEC, input, message);
