import { categories } from "@/data/categories";
import type { Project } from "@/data/projects";
import { GitHubError, getFile, putFile } from "./github";

/**
 * Serialize / deserialize data/projects.ts.
 *
 * Only the `projects` array literal is ever regenerated. Everything else in the
 * file — the Project type and its JSDoc, `reels`, `verticalProjects`,
 * `horizontalProjects`, `getProject`, `getProjectsByCategory`, `projectHref`,
 * and anything added later — is sliced out of the current file and reused
 * verbatim. No eval: the array is read with a tiny JS-literal parser.
 */

export const PROJECTS_PATH = "data/projects.ts";

const ARRAY_START = /export const projects\s*:\s*Project\[\]\s*=\s*/;
const PRINT_WIDTH = 100;

/** Field order used by the hand-written entries — keeps diffs minimal. */
const KEY_ORDER: (keyof Project)[] = [
  "id",
  "accentColor",
  "orientation",
  "title",
  "category",
  "year",
  "client",
  "role",
  "tools",
  "duration",
  "description",
  "videoUrl",
  "thumbnail",
  "featured",
];

export class ProjectsFileError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ProjectsFileError";
  }
}

/* ------------------------------------------------------------------ */
/* Deserialize                                                         */
/* ------------------------------------------------------------------ */

type Literal = string | number | boolean | null | Literal[] | { [key: string]: Literal };

class LiteralParser {
  i: number;
  constructor(
    private readonly src: string,
    start: number,
  ) {
    this.i = start;
  }

  private fail(msg: string): never {
    throw new ProjectsFileError(`Could not parse ${PROJECTS_PATH}: ${msg} at offset ${this.i}`, 500);
  }

  skip() {
    const s = this.src;
    for (;;) {
      while (this.i < s.length && /\s/.test(s[this.i])) this.i++;
      if (s.startsWith("//", this.i)) {
        const end = s.indexOf("\n", this.i);
        this.i = end === -1 ? s.length : end + 1;
      } else if (s.startsWith("/*", this.i)) {
        const end = s.indexOf("*/", this.i + 2);
        if (end === -1) this.fail("unterminated comment");
        this.i = end + 2;
      } else return;
    }
  }

  value(): Literal {
    this.skip();
    const c = this.src[this.i];
    if (c === "[") return this.array();
    if (c === "{") return this.object();
    if (c === '"' || c === "'") return this.string();
    if (c === "-" || /[0-9]/.test(c ?? "")) return this.number();
    for (const [word, val] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const) {
      if (this.src.startsWith(word, this.i)) {
        this.i += word.length;
        return val;
      }
    }
    return this.fail(`unexpected token "${c ?? "EOF"}"`);
  }

  private array(): Literal[] {
    const out: Literal[] = [];
    this.i++; // [
    for (;;) {
      this.skip();
      if (this.src[this.i] === "]") {
        this.i++;
        return out;
      }
      out.push(this.value());
      this.skip();
      if (this.src[this.i] === ",") this.i++;
      else if (this.src[this.i] !== "]") this.fail("expected , or ]");
    }
  }

  private object(): { [key: string]: Literal } {
    const out: { [key: string]: Literal } = {};
    this.i++; // {
    for (;;) {
      this.skip();
      if (this.src[this.i] === "}") {
        this.i++;
        return out;
      }
      const key = this.key();
      this.skip();
      if (this.src[this.i] !== ":") this.fail("expected :");
      this.i++;
      out[key] = this.value();
      this.skip();
      if (this.src[this.i] === ",") this.i++;
      else if (this.src[this.i] !== "}") this.fail("expected , or }");
    }
  }

  private key(): string {
    const c = this.src[this.i];
    if (c === '"' || c === "'") return this.string();
    const m = /^[A-Za-z_$][\w$]*/.exec(this.src.slice(this.i, this.i + 64));
    if (!m) return this.fail("expected key");
    this.i += m[0].length;
    return m[0];
  }

  private string(): string {
    const quote = this.src[this.i];
    let j = this.i + 1;
    while (j < this.src.length && this.src[j] !== quote) {
      if (this.src[j] === "\\") j++;
      j++;
    }
    if (j >= this.src.length) this.fail("unterminated string");
    let body = this.src.slice(this.i + 1, j);
    // Normalise a single-quoted body into a JSON string body.
    if (quote === "'") body = body.replace(/\\'/g, "'").replace(/(^|[^\\])"/g, '$1\\"');
    this.i = j + 1;
    try {
      return JSON.parse(`"${body}"`) as string;
    } catch {
      return this.fail("invalid string escape");
    }
  }

  private number(): number {
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(this.src.slice(this.i, this.i + 32));
    if (!m) return this.fail("invalid number");
    this.i += m[0].length;
    return Number(m[0]);
  }
}

/** Locates the array literal: [start of "[", index just past "]"]. */
function locateArray(source: string): { start: number; end: number; items: Literal[] } {
  const m = ARRAY_START.exec(source);
  if (!m) throw new ProjectsFileError(`Could not find the projects array in ${PROJECTS_PATH}`, 500);
  const start = m.index + m[0].length;
  const parser = new LiteralParser(source, start);
  const items = parser.value();
  if (!Array.isArray(items)) throw new ProjectsFileError(`projects in ${PROJECTS_PATH} is not an array`, 500);
  return { start, end: parser.i, items };
}

export function parseProjectsFile(source: string): Project[] {
  const { items } = locateArray(source);
  return items.map((item, idx) => {
    try {
      return validateProject(item);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "invalid entry";
      throw new ProjectsFileError(`Entry #${idx + 1} in ${PROJECTS_PATH}: ${msg}`, 500);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Serialize                                                           */
/* ------------------------------------------------------------------ */

function literal(value: Project[keyof Project]): string {
  // JSON.stringify gives double-quoted, correctly escaped strings; arrays of
  // strings go on one line with a space after commas, like the source.
  if (Array.isArray(value)) return `[${value.map((v) => JSON.stringify(v)).join(", ")}]`;
  return JSON.stringify(value);
}

function serializeProject(p: Project): string {
  const lines = ["  {"];
  for (const key of KEY_ORDER) {
    const value = p[key];
    if (value === undefined) continue;
    if (key === "featured" && value !== true) continue; // only `featured: true` is ever written
    const inline = `    ${key}: ${literal(value)},`;
    // Match prettier's break for long values: key on one line, value indented below.
    lines.push(inline.length > PRINT_WIDTH ? `    ${key}:\n      ${literal(value)},` : inline);
  }
  lines.push("  },");
  return lines.join("\n");
}

export function serializeProjectsArray(projects: Project[]): string {
  if (projects.length === 0) return "[]";
  return `[\n${projects.map(serializeProject).join("\n")}\n]`;
}

/** Rebuilds the whole file: every non-array block reused verbatim. */
export function writeProjectsFile(currentSource: string, projects: Project[]): string {
  const { start, end } = locateArray(currentSource);
  // Match the file's line endings (the repo is LF; a Windows checkout may be CRLF).
  const eol = currentSource.includes("\r\n") ? "\r\n" : "\n";
  const array = serializeProjectsArray(projects).replace(/\n/g, eol);
  return currentSource.slice(0, start) + array + currentSource.slice(end);
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const CATEGORY_IDS = new Set(categories.map((c) => c.id));
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const DURATION = /^(?:\d{1,2}:)?[0-5]\d:[0-5]\d$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(obj: Record<string, unknown>, key: string, max = 2000): string {
  const v = obj[key];
  if (typeof v !== "string") throw new ProjectsFileError(`"${key}" must be a string`);
  if (v.length > max) throw new ProjectsFileError(`"${key}" is too long (max ${max})`);
  return v;
}

function url(obj: Record<string, unknown>, key: string): string {
  const v = str(obj, key, 1000).trim();
  if (v && !/^https:\/\/\S+$/.test(v)) throw new ProjectsFileError(`"${key}" must be empty or an https URL`);
  return v;
}

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "project"
  );
}

export function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Validates an unknown value into a Project. Throws ProjectsFileError (400). */
export function validateProject(input: unknown): Project {
  if (!isRecord(input)) throw new ProjectsFileError("Project must be an object");

  const id = str(input, "id", 80);
  if (!SLUG.test(id)) throw new ProjectsFileError(`"id" must be a lowercase slug (got "${id}")`);

  const title = str(input, "title", 120).trim();
  if (!title) throw new ProjectsFileError("Title is required");

  const category = str(input, "category", 40);
  if (!CATEGORY_IDS.has(category)) throw new ProjectsFileError(`Unknown category "${category}"`);

  const year = input.year;
  if (typeof year !== "number" || !Number.isInteger(year) || year < 1990 || year > 2100) {
    throw new ProjectsFileError('"year" must be a whole number between 1990 and 2100');
  }

  const tools = input.tools;
  if (!Array.isArray(tools) || !tools.every((t): t is string => typeof t === "string")) {
    throw new ProjectsFileError('"tools" must be a list of strings');
  }

  const duration = str(input, "duration", 8);
  if (!DURATION.test(duration)) throw new ProjectsFileError('"duration" must be MM:SS or HH:MM:SS');

  const accentColor = str(input, "accentColor", 7);
  if (!HEX.test(accentColor)) throw new ProjectsFileError('"accentColor" must be a hex colour like #e7fe55');

  const orientation = input.orientation;
  if (orientation !== "vertical" && orientation !== "horizontal") {
    throw new ProjectsFileError('"orientation" must be "vertical" or "horizontal"');
  }

  const featured = input.featured;
  if (featured !== undefined && typeof featured !== "boolean") {
    throw new ProjectsFileError('"featured" must be true or false');
  }

  const project: Project = {
    id,
    title,
    category,
    year,
    client: str(input, "client", 120).trim(),
    role: str(input, "role", 120).trim(),
    tools: tools.map((t) => t.trim()).filter(Boolean),
    duration,
    description: str(input, "description", 2000).trim(),
    videoUrl: url(input, "videoUrl"),
    thumbnail: url(input, "thumbnail"),
    accentColor: accentColor.toLowerCase(),
    orientation,
  };
  if (featured) project.featured = true;
  return project;
}

/* ------------------------------------------------------------------ */
/* Read / write through GitHub                                         */
/* ------------------------------------------------------------------ */

export async function readProjects(): Promise<{ projects: Project[]; sha: string }> {
  const { content, sha } = await getFile(PROJECTS_PATH);
  return { projects: parseProjectsFile(content), sha };
}

type Mutation<T> = (projects: Project[]) => { projects: Project[]; message: string; result: T };

/**
 * Read → mutate → commit. Always re-reads right before writing so the sha is
 * fresh; retries once if someone else committed in between (409/422).
 */
export async function mutateProjects<T>(mutate: Mutation<T>): Promise<{ projects: Project[]; sha: string; result: T }> {
  for (let attempt = 0; ; attempt++) {
    const { content, sha } = await getFile(PROJECTS_PATH);
    const next = mutate(parseProjectsFile(content));
    try {
      const newSha = await putFile(PROJECTS_PATH, writeProjectsFile(content, next.projects), next.message, sha);
      return { projects: next.projects, sha: newSha, result: next.result };
    } catch (err) {
      const conflict = err instanceof GitHubError && (err.status === 409 || err.status === 422);
      if (!conflict || attempt >= 1) throw err;
    }
  }
}

/** Maps any thrown error to a JSON response without leaking internals. */
export function errorResponse(err: unknown): Response {
  if (err instanceof ProjectsFileError) {
    return Response.json({ ok: false, error: err.message }, { status: err.status });
  }
  if (err instanceof GitHubError) {
    const status = err.status === 409 || err.status === 422 ? 409 : 502;
    return Response.json({ ok: false, error: err.message }, { status });
  }
  return Response.json({ ok: false, error: "Unexpected server error" }, { status: 500 });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    if (isRecord(body)) return body;
  } catch {
    // fall through
  }
  throw new ProjectsFileError("Request body must be a JSON object");
}
