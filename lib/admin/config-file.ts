import { snapshotChanges, type BackupTarget } from "./backups";
import { commitFiles, getFile, getFileAt, getHead, GitHubError } from "./github";
import { LiteralParser, ProjectsFileError, type Literal } from "./projects-file";

/**
 * Generic "TypeScript file with one exported object literal" storage, used by
 * data/hero-config.ts and data/site-config.ts. Only the literal is rewritten;
 * types, constants and comments around it are reused verbatim. Every write
 * snapshots the version it replaces into backups/ in the SAME commit.
 */

export type ConfigSpec<T> = {
  /** Backup name prefix and the key used by the backups registry. */
  target: BackupTarget;
  path: string;
  /** Matches `export const name: Type = ` up to the literal. */
  start: RegExp;
  validate: (input: unknown) => T;
};

const PRINT_WIDTH = 110;

function locate<T>(spec: ConfigSpec<T>, source: string): { start: number; end: number; value: Literal } {
  const m = spec.start.exec(source);
  if (!m) throw new ProjectsFileError(`Could not find the config object in ${spec.path}`, 500);
  const start = m.index + m[0].length;
  const parser = new LiteralParser(source, start, spec.path);
  const value = parser.value();
  return { start, end: parser.i, value };
}

export function parseConfigSource<T>(spec: ConfigSpec<T>, source: string): T {
  try {
    return spec.validate(locate(spec, source).value);
  } catch (err) {
    if (err instanceof ProjectsFileError && err.status === 400) {
      throw new ProjectsFileError(`${spec.path} is invalid: ${err.message}`, 500);
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Printer — prettier-ish: bare keys, double quotes, trailing commas    */
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

export function writeConfigSource<T>(spec: ConfigSpec<T>, currentSource: string, value: T): string {
  const { start, end } = locate(spec, currentSource);
  const eol = currentSource.includes("\r\n") ? "\r\n" : "\n";
  const literal = print(value as unknown as Printable, 0, 40).replace(/\n/g, eol);
  return currentSource.slice(0, start) + literal + currentSource.slice(end);
}

/* ------------------------------------------------------------------ */
/* Read / write through GitHub                                         */
/* ------------------------------------------------------------------ */
export async function readConfig<T>(spec: ConfigSpec<T>): Promise<{ config: T; sha: string }> {
  const { content, sha } = await getFile(spec.path);
  return { config: parseConfigSource(spec, content), sha };
}

/**
 * Validates, then commits on top of the branch head together with a backup
 * of the version being replaced. Retried once if the branch moved.
 */
export async function writeConfig<T>(spec: ConfigSpec<T>, input: unknown, message: string): Promise<{ config: T; sha: string }> {
  const config = spec.validate(input);
  for (let attempt = 0; ; attempt++) {
    const head = await getHead();
    const content = await getFileAt(spec.path, head);
    if (content === null) throw new ProjectsFileError(`${spec.path} is missing on the branch`, 500);
    const next = writeConfigSource(spec, content, config);
    if (next === content) return { config, sha: head };
    try {
      const sha = await commitFiles(head, [{ path: spec.path, content: next }, ...(await snapshotChanges(spec.target, content))], message);
      return { config, sha };
    } catch (err) {
      const conflict = err instanceof GitHubError && (err.status === 409 || err.status === 422);
      if (!conflict || attempt >= 1) throw err;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Shared validation helpers                                           */
/* ------------------------------------------------------------------ */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const HEX = /^#[0-9a-fA-F]{6}$/;
/** Site-relative (no traversal) or https. */
export const ASSET = /^(?:\/(?!.*\.\.)[\w\-./%]+|https:\/\/\S+)$/;

export const fail = (msg: string): never => {
  throw new ProjectsFileError(msg);
};

export function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(`${what} must be an object`);
  return v as Record<string, unknown>;
}

export function text(o: Record<string, unknown>, k: string, what: string, max: number, required = true): string {
  const v = o[k];
  if (v === undefined && !required) return "";
  if (typeof v !== "string") return fail(`${what}: "${k}" must be text`);
  const t = v.trim();
  if (required && !t) fail(`${what}: "${k}" is required`);
  if (t.length > max) fail(`${what}: "${k}" is too long (max ${max})`);
  return t;
}

export function asset(o: Record<string, unknown>, k: string, what: string, required = true): string {
  const v = text(o, k, what, 1000, required);
  if (v && !ASSET.test(v)) fail(`${what}: "${k}" must be a /path or an https URL`);
  return v;
}

export function hex(o: Record<string, unknown>, k: string, what: string): string {
  const v = text(o, k, what, 7);
  if (!HEX.test(v)) fail(`${what}: "${k}" must be a hex colour like #e7fe55`);
  return v.toLowerCase();
}

/** Booleans; a missing key takes `fallback` (lets older files gain new switches). */
export function bool(o: Record<string, unknown>, k: string, what: string, fallback?: boolean): boolean {
  if (o[k] === undefined && fallback !== undefined) return fallback;
  if (typeof o[k] !== "boolean") fail(`${what}: "${k}" must be true or false`);
  return o[k] as boolean;
}

/** Number clamped to [min, max], rounded to `step`; a missing key takes `fallback`. */
export function num(o: Record<string, unknown>, k: string, what: string, min: number, max: number, step = 0.01, fallback?: number): number {
  const v = o[k];
  if (v === undefined && fallback !== undefined) return fallback;
  if (typeof v !== "number" || !Number.isFinite(v)) return fail(`${what}: "${k}" must be a number`);
  const c = Math.min(max, Math.max(min, v));
  return Number((Math.round(c / step) * step).toFixed(6)) || 0; // `|| 0` folds -0
}

export function oneOf<T extends string>(o: Record<string, unknown>, k: string, what: string, values: readonly T[], fallback?: T): T {
  const v = o[k];
  if (v === undefined && fallback !== undefined) return fallback;
  if (typeof v !== "string" || !(values as readonly string[]).includes(v)) fail(`${what}: "${k}" must be one of ${values.join(", ")}`);
  return v as T;
}
