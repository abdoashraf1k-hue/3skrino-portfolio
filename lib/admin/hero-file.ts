import { LADDER_SIZE, type BrandLogo, type HeroConfig, type HeroPose } from "@/data/hero-config";
import { commitFiles, getFile, getFileAt, getHead, GitHubError } from "./github";
import { LiteralParser, ProjectsFileError, type Literal } from "./projects-file";

/**
 * Serialize / deserialize data/hero-config.ts. Only the `heroConfig` object
 * literal is regenerated; the types and comments around it are reused
 * verbatim. Git history is the backup (hero edits don't use backups/, which
 * is reserved for data/projects.ts snapshots).
 */

export const HERO_PATH = "data/hero-config.ts";
const LITERAL_START = /export const heroConfig\s*:\s*HeroConfig\s*=\s*/;
const PRINT_WIDTH = 110;

function locate(source: string): { start: number; end: number; value: Literal } {
  const m = LITERAL_START.exec(source);
  if (!m) throw new ProjectsFileError(`Could not find heroConfig in ${HERO_PATH}`, 500);
  const start = m.index + m[0].length;
  const parser = new LiteralParser(source, start, HERO_PATH);
  const value = parser.value();
  return { start, end: parser.i, value };
}

export function parseHeroFile(source: string): HeroConfig {
  try {
    return validateHeroConfig(locate(source).value);
  } catch (err) {
    if (err instanceof ProjectsFileError && err.status === 400) {
      throw new ProjectsFileError(`${HERO_PATH} is invalid: ${err.message}`, 500);
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Serialize — prettier-ish: bare keys, double quotes, trailing commas  */
/* ------------------------------------------------------------------ */
type Printable = string | number | boolean | null | undefined | Printable[] | { [key: string]: Printable };

const IDENT = /^[A-Za-z_$][\w$]*$/;
const key = (k: string) => (IDENT.test(k) ? k : JSON.stringify(k));

function inline(v: Printable): string {
  if (Array.isArray(v)) return `[${v.map(inline).join(", ")}]`;
  if (v !== null && typeof v === "object") {
    const parts = Object.entries(v)
      .filter(([, x]) => x !== undefined)
      .map(([k, x]) => `${key(k)}: ${inline(x)}`);
    return parts.length ? `{ ${parts.join(", ")} }` : "{}";
  }
  return JSON.stringify(v);
}

function print(v: Printable, indent: number, prefixLen: number): string {
  const flat = inline(v);
  if (indent + prefixLen + flat.length + 1 <= PRINT_WIDTH || v === null || typeof v !== "object") return flat;
  const pad = " ".repeat(indent + 2);
  const close = " ".repeat(indent);
  if (Array.isArray(v)) {
    return `[\n${v.map((x) => `${pad}${print(x, indent + 2, 0)},`).join("\n")}\n${close}]`;
  }
  const lines = Object.entries(v)
    .filter(([, x]) => x !== undefined)
    .map(([k, x]) => `${pad}${key(k)}: ${print(x, indent + 2, key(k).length + 2)},`);
  return `{\n${lines.join("\n")}\n${close}}`;
}

export function writeHeroFile(currentSource: string, config: HeroConfig): string {
  const { start, end } = locate(currentSource);
  const eol = currentSource.includes("\r\n") ? "\r\n" : "\n";
  const literal = print(config as unknown as Printable, 0, 40).replace(/\n/g, eol);
  return currentSource.slice(0, start) + literal + currentSource.slice(end);
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
/** Site-relative (no traversal) or https. */
const ASSET = /^(?:\/(?!.*\.\.)[\w\-./%]+|https:\/\/\S+)$/;

const fail = (msg: string): never => {
  throw new ProjectsFileError(msg);
};

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(`${what} must be an object`);
  return v as Record<string, unknown>;
}

function text(o: Record<string, unknown>, k: string, what: string, max: number, required = true): string {
  const v = o[k];
  if (v === undefined && !required) return "";
  if (typeof v !== "string") return fail(`${what}: "${k}" must be text`);
  const t = v.trim();
  if (required && !t) fail(`${what}: "${k}" is required`);
  if (t.length > max) fail(`${what}: "${k}" is too long (max ${max})`);
  return t;
}

function asset(o: Record<string, unknown>, k: string, what: string, required = true): string {
  const v = text(o, k, what, 1000, required);
  if (v && !ASSET.test(v)) fail(`${what}: "${k}" must be a /path or an https URL`);
  return v;
}

function bool(o: Record<string, unknown>, k: string, what: string): boolean {
  if (typeof o[k] !== "boolean") fail(`${what}: "${k}" must be true or false`);
  return o[k] as boolean;
}

function unit(o: Record<string, unknown>, k: string, what: string): number {
  const v = o[k];
  if (typeof v !== "number" || !Number.isFinite(v)) return fail(`${what}: "${k}" must be a number`);
  return Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
}

function pose(v: unknown, what: string): HeroPose {
  const o = rec(v, what);
  const id = text(o, "id", what, 40);
  if (!SLUG.test(id)) fail(`${what}: id must be a lowercase slug`);
  const tint = text(o, "tint", what, 7);
  if (!HEX.test(tint)) fail(`${what}: tint must be a hex colour like #e7fe55`);
  return { id, label: text(o, "label", what, 40), src: asset(o, "src", what), tint: tint.toLowerCase() };
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
  const features = {
    ambientSound: bool(f, "ambientSound", "Features"),
    cinematicBars: bool(f, "cinematicBars", "Features"),
    parallax: unit(f, "parallax", "Features"),
    reactiveLighting: bool(f, "reactiveLighting", "Features"),
    cameraShake: bool(f, "cameraShake", "Features"),
    glitch: bool(f, "glitch", "Features"),
    chromaticAberration: unit(f, "chromaticAberration", "Features"),
    bloom: unit(f, "bloom", "Features"),
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
  if (typeof roles.interval !== "number" || !Number.isFinite(roles.interval)) fail("Role interval must be a number");
  const interval = Math.round(Math.min(30, Math.max(1.5, roles.interval as number)) * 10) / 10;

  return {
    poses: { ladder, up, down },
    logos: { enabled: bool(logos, "enabled", "Logos"), items },
    features,
    ambientSrc,
    roles: { items: roleItems, interval },
  };
}

/* ------------------------------------------------------------------ */
/* Read / write through GitHub                                         */
/* ------------------------------------------------------------------ */
export async function readHero(): Promise<{ config: HeroConfig; sha: string }> {
  const { content, sha } = await getFile(HERO_PATH);
  return { config: parseHeroFile(content), sha };
}

/** Validates, then commits on top of the branch head (retried once if the branch moved). */
export async function writeHero(input: unknown): Promise<{ config: HeroConfig; sha: string }> {
  const config = validateHeroConfig(input);
  for (let attempt = 0; ; attempt++) {
    const head = await getHead();
    const content = await getFileAt(HERO_PATH, head);
    if (content === null) throw new ProjectsFileError(`${HERO_PATH} is missing on the branch`, 500);
    const next = writeHeroFile(content, config);
    if (next === content) return { config, sha: head };
    try {
      const sha = await commitFiles(head, [{ path: HERO_PATH, content: next }], "admin: update hero settings");
      return { config, sha };
    } catch (err) {
      const conflict = err instanceof GitHubError && (err.status === 409 || err.status === 422);
      if (!conflict || attempt >= 1) throw err;
    }
  }
}
