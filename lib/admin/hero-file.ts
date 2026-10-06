import {
  LADDER_SIZE,
  LOGO_SIZE,
  type BrandLogo,
  type ConfrontationConfig,
  type ConfrontState,
  type HeroConfig,
  type HeroFilter,
  type HeroPose,
  type InterviewConfig,
  type InterviewQuestion,
  type RoleStyle,
} from "@/data/hero-config";
import { DEFAULT_CONFRONTATION, DEFAULT_EXPRESSIONS, DEFAULT_FEATURES, DEFAULT_INTERVIEW } from "@/data/hero-defaults";
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

/** data/hero-config.ts — poses, expressions, logos, effects, roles, Confrontation + Interview heroes. */

export const HERO_PATH = "data/hero-config.ts";
export const HERO_FILTERS: readonly HeroFilter[] = ["none", "warm", "cool", "vintage", "contrast"];
export const CONFRONT_STATES: readonly (ConfrontState | "static")[] = ["idle", "eyeContact", "smile", "surprise", "turnAway", "scoff", "static"];
const MAX_EXPRESSIONS = 40;

function tags(v: unknown, what: string): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || !v.every((t): t is string => typeof t === "string")) return fail(`${what}: tags must be a list of text`);
  const out = [...new Set(v.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (out.length > 12 || out.some((t) => t.length > 24)) fail(`${what}: at most 12 tags of 24 characters`);
  return out.length ? out : undefined;
}

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
  const t = tags(o.tags, what);
  if (t) out.tags = t;
  return out;
}

/** Optional finite number clamped to [min, max]; missing → undefined. */
function optNum(o: Record<string, unknown>, k: string, what: string, min: number, max: number, step: number): number | undefined {
  return o[k] === undefined || o[k] === null ? undefined : num(o, k, what, min, max, step);
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
  // Built in declaration order so the serialized file diffs cleanly.
  return {
    id,
    name,
    imageUrl,
    href: href || undefined,
    size: optNum(o, "size", what, LOGO_SIZE.min, LOGO_SIZE.max, 1),
    visible: bool(o, "visible", what),
    x: optNum(o, "x", what, 0, 100, 0.1),
    y: optNum(o, "y", what, 0, 100, 0.1),
    angle: optNum(o, "angle", what, -180, 180, 1),
    depth: optNum(o, "depth", what, -1, 1, 0.01),
  };
}

function roleStyles(v: unknown, roles: string[]): Record<string, RoleStyle> {
  const o = v === undefined ? {} : rec(v, "roles.styles");
  const out: Record<string, RoleStyle> = {};
  for (const role of roles) {
    if (o[role] === undefined) continue;
    const s = rec(o[role], `Role style "${role}"`);
    const what = `Role "${role}"`;
    const color = text(s, "color", what, 7, false);
    if (color && !HEX.test(color)) fail(`${what}: colour must be a hex like #e7fe55`);
    out[role] = { icon: text(s, "icon", what, 60, false), weight: num(s, "weight", what, 100, 900, 100, 900), color: color.toLowerCase() };
  }
  return out;
}

/** A pose id that exists; otherwise the fallback (a deleted pose never breaks the hero). */
const poseRef = (o: Record<string, unknown>, k: string, ids: Set<string>, fallback: string): string =>
  typeof o[k] === "string" && ids.has(o[k] as string) ? (o[k] as string) : ids.has(fallback) ? fallback : "center";

function confrontation(v: unknown, ids: Set<string>): ConfrontationConfig {
  const d = DEFAULT_CONFRONTATION;
  const o = v === undefined ? {} : rec(v, "confrontation");
  const W = "Confrontation";
  const b = o.behaviors === undefined ? {} : rec(o.behaviors, "confrontation.behaviors");
  const behaviors = Object.fromEntries(
    (Object.keys(d.behaviors) as (keyof ConfrontationConfig["behaviors"])[]).map((k) => [k, bool(b, k, W, d.behaviors[k])]),
  ) as ConfrontationConfig["behaviors"];
  const p = o.poses === undefined ? {} : rec(o.poses, "confrontation.poses");
  const poses = Object.fromEntries(CONFRONT_STATES.map((k) => [k, poseRef(p, k, ids, d.poses[k])])) as ConfrontationConfig["poses"];
  const s = o.sensitivity === undefined ? {} : rec(o.sensitivity, "confrontation.sensitivity");
  const ds = d.sensitivity;
  const sensitivity = {
    tracking: num(s, "tracking", W, 0, 1, 0.01, ds.tracking),
    smileAfter: num(s, "smileAfter", W, 0.5, 20, 0.1, ds.smileAfter),
    surpriseHold: num(s, "surpriseHold", W, 100, 4000, 10, ds.surpriseHold),
    turnAwayAfter: num(s, "turnAwayAfter", W, 2, 60, 0.5, ds.turnAwayAfter),
    eyeContactZoom: num(s, "eyeContactZoom", W, 1, 1.2, 0.005, ds.eyeContactZoom),
    glint: num(s, "glint", W, 0, 1, 0.01, ds.glint),
    breathing: num(s, "breathing", W, 0, 1, 0.01, ds.breathing),
  };
  const l = o.lenses === undefined ? {} : rec(o.lenses, "confrontation.lenses");
  const pt = (k: "left" | "right"): [number, number] => {
    const v2 = l[k];
    if (v2 === undefined) return d.lenses[k];
    if (!Array.isArray(v2) || v2.length !== 2 || !v2.every((n): n is number => typeof n === "number" && Number.isFinite(n))) {
      return fail(`Confrontation: lens "${k}" must be [x, y]`);
    }
    return [Math.round(Math.min(1, Math.max(0, v2[0])) * 1000) / 1000, Math.round(Math.min(1, Math.max(0, v2[1])) * 1000) / 1000];
  };
  return {
    behaviors,
    poses,
    sensitivity,
    lenses: { left: pt("left"), right: pt("right"), radius: num(l, "radius", W, 0.02, 0.2, 0.001, d.lenses.radius) },
  };
}

function question(v: unknown, i: number): InterviewQuestion {
  const what = `Question #${i + 1}`;
  const o = rec(v, what);
  const id = text(o, "id", what, 40);
  if (!SLUG.test(id)) fail(`${what}: id must be a lowercase slug`);
  if (o.keywords !== undefined && (!Array.isArray(o.keywords) || !o.keywords.every((k): k is string => typeof k === "string"))) {
    fail(`${what}: keywords must be a list of text`);
  }
  const keywords = [...new Set(((o.keywords as string[] | undefined) ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean))];
  if (keywords.length > 30 || keywords.some((k) => k.length > 40)) fail(`${what}: at most 30 keywords of 40 characters`);
  return {
    id,
    question: text(o, "question", what, 140),
    answer: text(o, "answer", what, 1200),
    keywords,
    preset: bool(o, "preset", what, true),
  };
}

function interview(v: unknown, ids: Set<string>): InterviewConfig {
  const d = DEFAULT_INTERVIEW;
  const o = v === undefined ? {} : rec(v, "interview");
  const W = "Interview";
  const qs = o.questions === undefined ? d.questions : Array.isArray(o.questions) ? (o.questions as unknown[]).map(question) : fail("Interview: questions must be a list");
  if (qs.length > 40) fail("Interview: at most 40 questions");
  if (new Set(qs.map((q) => q.id)).size !== qs.length) fail("Interview: question ids must be unique");
  const p = o.poses === undefined ? {} : rec(o.poses, "interview.poses");
  const t = o.tts === undefined ? {} : rec(o.tts, "interview.tts");
  const str = (k: "title" | "intro" | "outro" | "fallback", max: number) => (o[k] === undefined ? d[k] : text(o, k, W, max));
  return {
    title: str("title", 60),
    channel: num(o, "channel", W, 1, 99, 1, d.channel),
    intro: str("intro", 300),
    outro: str("outro", 300),
    maxQuestions: num(o, "maxQuestions", W, 1, 12, 1, d.maxQuestions),
    fallback: str("fallback", 600),
    questions: qs,
    poses: {
      waiting: poseRef(p, "waiting", ids, d.poses.waiting),
      talking: poseRef(p, "talking", ids, d.poses.talking),
      emphasis: poseRef(p, "emphasis", ids, d.poses.emphasis),
      pensive: poseRef(p, "pensive", ids, d.poses.pensive),
      thanks: poseRef(p, "thanks", ids, d.poses.thanks),
    },
    tts: {
      enabled: bool(t, "enabled", W, d.tts.enabled),
      voice: t.voice === undefined ? d.tts.voice : text(t, "voice", W, 120, false),
      rate: num(t, "rate", W, 0.5, 2, 0.05, d.tts.rate),
      pitch: num(t, "pitch", W, 0, 2, 0.05, d.tts.pitch),
      volume: num(t, "volume", W, 0, 1, 0.05, d.tts.volume),
    },
    crt: bool(o, "crt", W, d.crt),
    subtitles: bool(o, "subtitles", W, d.subtitles),
    waveform: bool(o, "waveform", W, d.waveform),
  };
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

  // Sprint 11: files written before expressions existed get the generated set.
  if (o.expressions !== undefined && !Array.isArray(o.expressions)) fail("expressions must be a list");
  const expressions = o.expressions === undefined ? DEFAULT_EXPRESSIONS : (o.expressions as unknown[]).map((p, i) => pose(p, `Expression #${i + 1}`));
  if (expressions.length > MAX_EXPRESSIONS) fail(`At most ${MAX_EXPRESSIONS} expression poses`);

  const ids = [...ladder, up, down, ...expressions].map((p) => p.id);
  if (new Set(ids).size !== ids.length) fail("Pose ids must be unique");
  const idSet = new Set(ids);

  const logos = rec(o.logos, "logos");
  if (!Array.isArray(logos.items)) fail("logos.items must be a list");
  const items = (logos.items as unknown[]).map(logo);
  if (items.length > 48) fail("At most 48 logos");
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
    expressions,
    logos: { enabled: bool(logos, "enabled", "Logos"), scale: num(logos, "scale", "Logos", 0.25, 4, 0.05, 1), items },
    features,
    ambientSrc,
    roles: { items: roleItems, interval, styles: roleStyles(roles.styles, roleItems) },
    confrontation: confrontation(o.confrontation, idSet),
    interview: interview(o.interview, idSet),
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
