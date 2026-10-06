/**
 * Sprint 12 — moves project videos from Vercel Blob to Backblaze B2 (S3 API).
 *
 *   node scripts/migrate-blob-to-b2.mjs                 # DRY RUN: list blobs, references, plan
 *   node scripts/migrate-blob-to-b2.mjs --confirm       # copy + verify + rewrite data/projects.ts
 *   node scripts/migrate-blob-to-b2.mjs --rollback      # restore the newest data/projects.ts backup
 *   node scripts/migrate-blob-to-b2.mjs --help
 *
 * Safety model:
 *   - Nothing is written anywhere without --confirm.
 *   - Each video streams Blob → B2 as a multipart upload (16 MiB parts, one part
 *     buffered at a time). A failed or interrupted upload is aborted on B2.
 *   - The B2 object is verified with HeadObject (size must equal the source
 *     Content-Length) before data/projects.ts is touched.
 *   - data/projects.ts is backed up to .migration/ before the first rewrite, and
 *     only exact old-URL strings are replaced (formatting and CRLF/LF untouched).
 *   - Progress is saved to .migration/state.json after every video, so a re-run
 *     resumes and skips finished work.
 *   - Vercel Blob is never deleted from unless --delete-source is passed, the
 *     copy was verified, the old URL no longer appears in data/projects.ts, and
 *     someone types DELETE at an interactive prompt.
 *
 * The script edits the LOCAL data/projects.ts. The admin commits the same file
 * through GitHub, so pull first and commit afterwards.
 *
 * Deps: @vercel/blob (already installed) and @aws-sdk/client-s3 (loaded lazily).
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECTS_FILE = path.join(ROOT, "data/projects.ts");
const STATE_DIR = path.join(ROOT, ".migration");
const STATE_FILE = path.join(STATE_DIR, "state.json");
const BACKUP_PREFIX = "projects.backup-";
/** Admin snapshots (Backups tab) — restoring one brings its URLs back. */
const ADMIN_BACKUPS_DIR = path.join(ROOT, "backups");

const MiB = 1024 * 1024;
/** Part size (contract LIMITS.defaultPartBytes). */
const PART_BYTES = 16 * MiB;
/** S3 hard limit; with 16 MiB parts that's ~156 GiB, far above LIMITS.maxVideoBytes. */
const MAX_PARTS = 10_000;
const PART_ATTEMPTS = 3;
/** Mirrors KEY_PATTERN in lib/admin/storage/contract.ts (a .ts file this script can't import). */
const KEY_PATTERN = /^(videos|thumbnails)\/\d{10,16}-[a-z0-9-]{6,40}\.[a-z0-9]{2,5}$/;
/** Mirrors isBlobUrl in the contract. */
const BLOB_URL_RE = /https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[^"'`\s)]+/gi;

const CONTENT_TYPES = /** @type {Record<string, string>} */ ({
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
});

const DONE_MESSAGE =
  "Commit data/projects.ts (git) to publish the new URLs — the admin also commits through GitHub, so pull first if you edited projects in the admin meanwhile.";

const USAGE = `Move project videos from Vercel Blob to Backblaze B2 (S3 API).

Usage: node scripts/migrate-blob-to-b2.mjs [options]

  (no options)         Dry run: list every blob under videos/, which projects use it,
                       orphans, sizes and the plan. Writes nothing.
  --confirm            Copy, verify (HeadObject size) and rewrite data/projects.ts.
  --only=<project-id>  Only migrate the video(s) referenced by this project.
  --limit=<N>          Migrate at most N videos this run.
  --include-orphans    Also copy blobs no project references (no rewrite needed).
  --delete-source      After verified copies, delete the old blobs from Vercel Blob.
                       Refused until the rewritten data/projects.ts is committed AND
                       pushed (the live site plays the old URLs until it deploys) —
                       so run it as a second, later pass. Asks you to type DELETE;
                       skipped when stdin is not a TTY.
  --rollback           Restore the newest .migration/projects.backup-*.ts into
                       data/projects.ts (B2 objects are kept). Refused when any
                       original was already deleted, unless --force.
  --force              With --rollback: restore even though some originals are gone.
  -h, --help           Show this help.

Env (.env.local or the shell): BLOB_READ_WRITE_TOKEN, B2_ENDPOINT, B2_KEY_ID,
B2_APP_KEY, B2_BUCKET_NAME, optional B2_REGION (derived from the endpoint),
NEXT_PUBLIC_CDN_URL, NEXT_PUBLIC_SITE_URL (default https://3skrino.com).

State: .migration/state.json (resumable), .migration/projects.backup-<timestamp>.ts`;

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/**
 * @typedef {{ url: string, pathname: string, size: number }} BlobItem
 * @typedef {{
 *   key: string, newUrl: string, size: number,
 *   uploaded: boolean, rewritten: boolean, done: boolean,
 *   projects: string[], orphan: boolean, sourceDeleted?: boolean, updatedAt: string
 * }} StateEntry
 * @typedef {{ version: 1, entries: Record<string, StateEntry> }} State
 * @typedef {{ blob: BlobItem, projects: string[] }} Job
 * @typedef {{
 *   endpoint: string, region: string, keyId: string, appKey: string, bucket: string,
 *   publicBase: string
 * }} B2Config
 * @typedef {{ client: import("@aws-sdk/client-s3").S3Client, sdk: typeof import("@aws-sdk/client-s3"), bucket: string }} S3
 * @typedef {{ key: string, uploadId: string, s3: S3, fetchAbort: AbortController }} InFlight
 */

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const mb = (/** @type {number} */ bytes) => `${(bytes / MiB).toFixed(1)} MB`;
const errMsg = (/** @type {unknown} */ e) => (e instanceof Error ? e.message : String(e));
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
const nowStamp = () => new Date().toISOString().replace(/[:.]/g, "-");

/** Loads KEY=VALUE lines from .env.local without overriding the real environment. */
async function loadEnvFile() {
  const file = path.join(ROOT, ".env.local");
  if (!existsSync(file)) return false;
  const text = await readFile(file, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2];
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) {
      value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\n/g, "\n");
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
  return true;
}

/** @param {string} name */
const env = (name) => (process.env[name] ?? "").trim();

/** "https://s3.us-west-004.backblazeb2.com" → "us-west-004". */
function regionFromEndpoint(/** @type {string} */ endpoint) {
  const m = /s3\.([a-z0-9-]+)\.backblazeb2\.com/i.exec(endpoint);
  return m ? m[1].toLowerCase() : "us-east-1";
}

/** @returns {{ config: B2Config | null, missing: string[] }} */
function readB2Config() {
  const required = ["B2_ENDPOINT", "B2_KEY_ID", "B2_APP_KEY", "B2_BUCKET_NAME"];
  const missing = required.filter((n) => !env(n));
  const rawEndpoint = env("B2_ENDPOINT");
  const endpoint = rawEndpoint && !/^https?:\/\//i.test(rawEndpoint) ? `https://${rawEndpoint}` : rawEndpoint;
  const cdn = env("NEXT_PUBLIC_CDN_URL").replace(/\/+$/, "");
  const site = (env("NEXT_PUBLIC_SITE_URL") || "https://3skrino.com").replace(/\/+$/, "");
  const publicBase = cdn || `${site}/media`;
  if (missing.length) return { config: null, missing };
  return {
    missing,
    config: {
      endpoint,
      region: env("B2_REGION") || regionFromEndpoint(endpoint),
      keyId: env("B2_KEY_ID"),
      appKey: env("B2_APP_KEY"),
      bucket: env("B2_BUCKET_NAME"),
      publicBase,
    },
  };
}

/** Lowercase extension from a pathname, constrained to the contract's key pattern. */
function extOf(/** @type {string} */ pathname) {
  const ext = path.posix.extname(pathname).slice(1).toLowerCase();
  return /^[a-z0-9]{2,5}$/.test(ext) ? ext : "mp4";
}

function newKey(/** @type {string} */ pathname) {
  const key = `videos/${Date.now()}-${randomUUID()}.${extOf(pathname)}`;
  if (!KEY_PATTERN.test(key)) throw new Error(`Generated key does not match KEY_PATTERN: ${key}`);
  return key;
}

/* ------------------------------------------------------------------ */
/* State + projects file                                               */
/* ------------------------------------------------------------------ */

/** @returns {Promise<State>} */
async function loadState() {
  if (!existsSync(STATE_FILE)) return { version: 1, entries: {} };
  const parsed = JSON.parse(await readFile(STATE_FILE, "utf8"));
  return { version: 1, entries: parsed && typeof parsed.entries === "object" ? parsed.entries : {} };
}

/** Atomic write (tmp + rename) so a crash never leaves a half-written state file. */
async function saveState(/** @type {State} */ state) {
  await mkdir(STATE_DIR, { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(tmp, STATE_FILE);
}

/**
 * Every Vercel Blob URL under /videos/ in data/projects.ts, mapped to the ids of
 * the projects (nearest preceding `id: "…"`) that reference it.
 * @param {string} text
 * @returns {Map<string, string[]>}
 */
function findReferences(text) {
  /** @type {{ pos: number, id: string }[]} */
  const ids = [];
  for (const m of text.matchAll(/\bid:\s*"([^"]+)"/g)) ids.push({ pos: m.index ?? 0, id: m[1] });
  /** @type {Map<string, string[]>} */
  const refs = new Map();
  for (const m of text.matchAll(BLOB_URL_RE)) {
    const url = m[0];
    if (!new URL(url).pathname.startsWith("/videos/")) continue;
    const pos = m.index ?? 0;
    let owner = "(unknown)";
    for (const entry of ids) {
      if (entry.pos < pos) owner = entry.id;
      else break;
    }
    const list = refs.get(url) ?? [];
    if (!list.includes(owner)) list.push(owner);
    refs.set(url, list);
  }
  return refs;
}

/** Count non-Blob video URLs (e.g. Cloudinary) so the plan can say they're left alone. */
function countOtherVideoUrls(/** @type {string} */ text) {
  let n = 0;
  for (const m of text.matchAll(/videoUrl:\s*"([^"]*)"/g)) if (m[1] && !/\.public\.blob\.vercel-storage\.com\//i.test(m[1])) n++;
  return n;
}

/** Backs up data/projects.ts once per run, before the first rewrite. */
let backupPath = "";
async function backupProjectsOnce() {
  if (backupPath) return backupPath;
  await mkdir(STATE_DIR, { recursive: true });
  backupPath = path.join(STATE_DIR, `${BACKUP_PREFIX}${nowStamp()}.ts`);
  await copyFile(PROJECTS_FILE, backupPath);
  console.log(`  backup: ${path.relative(ROOT, backupPath)}`);
  return backupPath;
}

/**
 * Replaces every exact occurrence of oldUrl with newUrl. Bytes outside the URLs
 * (indentation, quotes, CRLF) are untouched.
 * @returns {Promise<number>} replacements made
 */
async function rewriteProjects(/** @type {string} */ oldUrl, /** @type {string} */ newUrl) {
  const text = await readFile(PROJECTS_FILE, "utf8");
  const count = text.split(oldUrl).length - 1;
  if (count === 0) return 0;
  await backupProjectsOnce();
  const next = text.split(oldUrl).join(newUrl);
  const tmp = `${PROJECTS_FILE}.migrating`;
  await writeFile(tmp, next, "utf8");
  await rename(tmp, PROJECTS_FILE);
  return count;
}

/* ------------------------------------------------------------------ */
/* Git (best effort)                                                   */
/* ------------------------------------------------------------------ */

function git(/** @type {string[]} */ args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 30_000 }).trim();
}

function warnIfBehindOrigin() {
  try {
    git(["rev-parse", "--is-inside-work-tree"]);
  } catch {
    console.log("  git: not available — skipped the 'behind origin' check.");
    return;
  }
  try {
    git(["fetch", "--quiet"]);
  } catch {
    console.log("  git: fetch failed (offline?) — comparing with the last fetched origin state.");
  }
  try {
    const behind = git(["log", "--oneline", "HEAD..@{u}", "--", "data/projects.ts"]);
    if (behind) {
      const n = behind.split(/\r?\n/).length;
      console.warn(`\n  WARNING: data/projects.ts is ${n} commit(s) behind origin (the admin commits there).`);
      console.warn("  Run `git pull` first, or the migrated file will conflict with the admin's edits.\n");
    } else {
      console.log("  git: data/projects.ts is up to date with origin.");
    }
    if (git(["status", "--porcelain", "--", "data/projects.ts"])) {
      console.log("  git: note — data/projects.ts has uncommitted local changes.");
    }
  } catch {
    console.log("  git: no upstream branch — skipped the 'behind origin' check.");
  }
}

/* ------------------------------------------------------------------ */
/* Vercel Blob                                                         */
/* ------------------------------------------------------------------ */

/** @returns {Promise<BlobItem[]>} */
async function listVideoBlobs(/** @type {string} */ token) {
  const { list } = await import("@vercel/blob");
  /** @type {BlobItem[]} */
  const out = [];
  /** @type {string | undefined} */
  let cursor;
  do {
    const page = await list({ prefix: "videos/", cursor, limit: 1000, token });
    for (const b of page.blobs) out.push({ url: b.url, pathname: b.pathname, size: b.size });
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

/* ------------------------------------------------------------------ */
/* B2 (S3 API)                                                         */
/* ------------------------------------------------------------------ */

/** @returns {Promise<S3>} */
async function connectS3(/** @type {B2Config} */ cfg) {
  /** @type {typeof import("@aws-sdk/client-s3")} */
  let sdk;
  try {
    sdk = await import("@aws-sdk/client-s3");
  } catch {
    throw new Error("@aws-sdk/client-s3 is not installed. Run `npm install` (it is listed in package.json) and retry.");
  }
  const client = new sdk.S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: { accessKeyId: cfg.keyId, secretAccessKey: cfg.appKey },
    forcePathStyle: true,
    // B2 rejects the SDK's default CRC32 trailers; only checksum when the API requires it.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return { client, sdk, bucket: cfg.bucket };
}

/** @type {InFlight | null} */
let inFlight = null;

async function abortInFlight() {
  const job = inFlight;
  inFlight = null;
  if (!job) return;
  job.fetchAbort.abort();
  try {
    await job.s3.client.send(new job.s3.sdk.AbortMultipartUploadCommand({ Bucket: job.s3.bucket, Key: job.key, UploadId: job.uploadId }));
    console.error(`  aborted multipart upload ${job.key}`);
  } catch (e) {
    console.error(`  could not abort multipart upload ${job.key} (uploadId ${job.uploadId}): ${errMsg(e)}`);
  }
}

/** @param {() => Promise<T>} fn @template T */
async function withRetry(fn, /** @type {string} */ label) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= PART_ATTEMPTS || interrupted) throw e;
      const wait = 500 * 2 ** attempt + Math.random() * 250;
      console.warn(`\n  ${label} failed (${errMsg(e)}), retry ${attempt}/${PART_ATTEMPTS - 1} in ${Math.round(wait)} ms`);
      await sleep(wait);
    }
  }
}

/** Progress printer: one updating line on a TTY, a line every ~10% otherwise. */
function progress(/** @type {number} */ total) {
  const start = Date.now();
  let lastPct = -10;
  return {
    /** @param {number} done */
    update(done) {
      const pct = total ? Math.floor((done / total) * 100) : 100;
      const secs = Math.max((Date.now() - start) / 1000, 0.001);
      const line = `  ${String(pct).padStart(3)}%  ${mb(done)} / ${mb(total)}  ${(done / MiB / secs).toFixed(1)} MB/s`;
      if (process.stdout.isTTY) process.stdout.write(`\r${line}   `);
      else if (pct >= lastPct + 10) {
        lastPct = pct;
        console.log(line);
      }
    },
    end() {
      if (process.stdout.isTTY) process.stdout.write("\n");
      return (Date.now() - start) / 1000;
    },
  };
}

/**
 * Streams one blob into B2 as a multipart upload, buffering one part at a time.
 * @returns {Promise<{ bytes: number, sourceSize: number }>}
 */
async function copyBlobToB2(/** @type {S3} */ s3, /** @type {BlobItem} */ blob, /** @type {string} */ key) {
  const fetchAbort = new AbortController();
  const res = await fetch(blob.url, { signal: fetchAbort.signal });
  if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status} ${res.statusText}`);
  const headerLength = Number(res.headers.get("content-length"));
  const sourceSize = Number.isFinite(headerLength) && headerLength > 0 ? headerLength : blob.size;
  if (sourceSize !== blob.size) throw new Error(`Content-Length ${sourceSize} differs from the listed size ${blob.size}`);
  if (Math.ceil(sourceSize / PART_BYTES) > MAX_PARTS) throw new Error("file too large for 16 MiB parts");
  const contentType = CONTENT_TYPES[extOf(blob.pathname)] ?? res.headers.get("content-type") ?? "application/octet-stream";

  const { sdk, client, bucket } = s3;
  const created = await client.send(
    new sdk.CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }),
  );
  const uploadId = created.UploadId;
  if (!uploadId) throw new Error("CreateMultipartUpload returned no UploadId");
  inFlight = { key, uploadId, s3, fetchAbort };

  const bar = progress(sourceSize);
  /** @type {{ PartNumber: number, ETag: string }[]} */
  const parts = [];
  let bytes = 0;
  /** @type {Buffer[]} */
  let pending = [];
  let pendingBytes = 0;

  const flush = async (/** @type {Buffer} */ body) => {
    const PartNumber = parts.length + 1;
    const out = await withRetry(
      () => client.send(new sdk.UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber, Body: body, ContentLength: body.length })),
      `part ${PartNumber}`,
    );
    if (!out.ETag) throw new Error(`part ${PartNumber}: no ETag returned`);
    parts.push({ PartNumber, ETag: out.ETag });
    bytes += body.length;
    bar.update(bytes);
  };

  try {
    const reader = res.body.getReader();
    for (;;) {
      if (interrupted) throw new Error("interrupted");
      const { done, value } = await reader.read();
      if (done) break;
      pending.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
      pendingBytes += value.byteLength;
      if (pendingBytes >= PART_BYTES) {
        // Await the upload before reading on: backpressure keeps memory at ~one part.
        const joined = Buffer.concat(pending, pendingBytes);
        const body = joined.subarray(0, PART_BYTES);
        const rest = joined.subarray(PART_BYTES);
        pending = rest.length ? [Buffer.from(rest)] : [];
        pendingBytes = rest.length;
        await flush(body);
      }
    }
    if (pendingBytes > 0 || parts.length === 0) await flush(Buffer.concat(pending, pendingBytes));
    if (bytes !== sourceSize) throw new Error(`streamed ${bytes} bytes but the source is ${sourceSize}`);
    await client.send(
      new sdk.CompleteMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts } }),
    );
    inFlight = null;
    const secs = bar.end();
    console.log(`  uploaded ${mb(bytes)} in ${secs.toFixed(1)} s (${(bytes / MiB / Math.max(secs, 0.001)).toFixed(1)} MB/s)`);
    return { bytes, sourceSize };
  } catch (e) {
    bar.end();
    await abortInFlight();
    throw e;
  }
}

/** HeadObject size check. @returns {Promise<number>} the size B2 reports */
async function verifyObject(/** @type {S3} */ s3, /** @type {string} */ key, /** @type {number} */ expected) {
  const head = await s3.client.send(new s3.sdk.HeadObjectCommand({ Bucket: s3.bucket, Key: key }));
  const size = Number(head.ContentLength);
  if (size !== expected) throw new Error(`verification failed: B2 has ${size} bytes, source has ${expected}`);
  return size;
}

/* ------------------------------------------------------------------ */
/* Ctrl-C                                                              */
/* ------------------------------------------------------------------ */

let interrupted = false;
process.on("SIGINT", () => {
  if (interrupted) process.exit(130);
  interrupted = true;
  console.error("\n  Ctrl-C — aborting the in-flight upload (press again to force quit)…");
  abortInFlight().finally(() => {
    console.error("  Stopped. Finished videos are saved in .migration/state.json; re-run to resume.");
    process.exit(130);
  });
});

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

async function rollback(/** @type {boolean} */ force) {
  const files = existsSync(STATE_DIR) ? (await readdir(STATE_DIR)).filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith(".ts")) : [];
  if (!files.length) {
    console.error("No backups found in .migration/ — nothing to roll back.");
    return 1;
  }
  const newest = files.sort().at(-1) ?? "";
  const gone = Object.values((await loadState()).entries).filter((e) => !e.orphan && e.sourceDeleted);
  if (gone.length && !force) {
    console.error(`Refusing to roll back: ${gone.length} original(s) were already deleted from Vercel Blob, so the`);
    console.error("restored data/projects.ts would point at dead links. Re-run with --rollback --force to do it anyway.");
    return 1;
  }
  await copyFile(path.join(STATE_DIR, newest), PROJECTS_FILE);
  console.log(`Restored data/projects.ts from .migration/${newest}.`);

  const state = await loadState();
  const deleted = [];
  for (const [oldUrl, entry] of Object.entries(state.entries)) {
    if (entry.orphan) continue;
    entry.rewritten = false;
    entry.done = false;
    if (entry.sourceDeleted) deleted.push(oldUrl);
  }
  await saveState(state);
  console.log("State reset: a later --confirm run re-verifies the existing B2 copies and rewrites again (no re-upload).");
  if (deleted.length) {
    console.warn(`\nWARNING: ${deleted.length} restored URL(s) point at blobs that were already deleted from Vercel Blob:`);
    for (const u of deleted) console.warn(`  ${u}`);
  }
  console.log("\nB2 objects were NOT deleted. To remove them, delete the keys listed in .migration/state.json");
  console.log("in the Backblaze web UI (Buckets → Browse Files) or with `b2 rm` / `aws s3 rm --endpoint-url $B2_ENDPOINT`.");
  return 0;
}

/**
 * @param {{ confirm: boolean, only?: string, limit?: number, includeOrphans: boolean, deleteSource: boolean }} opts
 */
async function migrate(opts) {
  const token = env("BLOB_READ_WRITE_TOKEN");
  const { config: b2, missing } = readB2Config();

  console.log(opts.confirm ? "MIGRATION (--confirm)\n" : "DRY RUN — nothing will be written. Add --confirm to migrate.\n");
  console.log("Environment:");
  for (const name of ["BLOB_READ_WRITE_TOKEN", "B2_ENDPOINT", "B2_KEY_ID", "B2_APP_KEY", "B2_BUCKET_NAME", "B2_REGION", "NEXT_PUBLIC_CDN_URL", "NEXT_PUBLIC_SITE_URL"]) {
    console.log(`  ${name.padEnd(22)} ${env(name) ? "set" : "-"}`);
  }
  if (b2) console.log(`  → bucket ${b2.bucket} @ ${b2.endpoint} (region ${b2.region}); new URLs start with ${b2.publicBase}/`);
  console.log("");
  warnIfBehindOrigin();
  console.log("");

  if (!token) {
    console.error("BLOB_READ_WRITE_TOKEN is missing. Add it to .env.local (e.g. `vercel env pull .env.local`) or export it, then retry.");
    return 1;
  }
  if (opts.confirm && !b2) {
    console.error(`--confirm needs the B2 settings; missing: ${missing.join(", ")}.`);
    return 1;
  }

  /** @type {BlobItem[]} */
  let blobs;
  try {
    blobs = await listVideoBlobs(token);
  } catch (e) {
    console.error(`Could not list Vercel Blob (videos/): ${errMsg(e)}`);
    console.error("Check that BLOB_READ_WRITE_TOKEN is the read-write token of this project's Blob store.");
    return 1;
  }

  const text = await readFile(PROJECTS_FILE, "utf8");
  const refs = findReferences(text);
  const state = await loadState();
  const byUrl = new Map(blobs.map((b) => [b.url, b]));

  // ---- Inventory --------------------------------------------------------
  console.log(`Vercel Blob videos/: ${blobs.length} file(s), ${mb(blobs.reduce((s, b) => s + b.size, 0))}`);
  for (const b of blobs) {
    const users = refs.get(b.url);
    const st = state.entries[b.url];
    const tag = st?.done ? "migrated" : st?.uploaded ? "uploaded, not rewritten" : users ? "referenced" : "ORPHAN";
    console.log(`  ${mb(b.size).padStart(10)}  ${b.pathname}`);
    console.log(`  ${"".padStart(10)}  ${tag}${users ? ` by ${users.join(", ")}` : ""}`);
  }
  const missingFromStore = [...refs.keys()].filter((u) => !byUrl.has(u) && !state.entries[u]);
  if (missingFromStore.length) {
    console.warn(`\n${missingFromStore.length} Blob URL(s) in data/projects.ts are NOT in the store (cannot migrate):`);
    for (const u of missingFromStore) console.warn(`  ${u}  (${(refs.get(u) ?? []).join(", ")})`);
  }
  const others = countOtherVideoUrls(text);
  if (others) console.log(`\n${others} project video URL(s) are not on Vercel Blob (e.g. Cloudinary) — left alone.`);

  // ---- Plan ---------------------------------------------------------------
  /** @type {Job[]} */
  let jobs = blobs
    .filter((b) => refs.has(b.url) || opts.includeOrphans)
    .filter((b) => !state.entries[b.url]?.done)
    .map((b) => ({ blob: b, projects: refs.get(b.url) ?? [] }));
  if (opts.only) {
    const only = opts.only;
    jobs = jobs.filter((j) => j.projects.includes(only));
    if (!jobs.length && ![...refs.values()].some((ids) => ids.includes(only))) {
      console.error(`\n--only=${only}: no Vercel Blob video in data/projects.ts belongs to that project id.`);
      return 1;
    }
  }
  if (opts.limit !== undefined) jobs = jobs.slice(0, opts.limit);
  const orphanCount = blobs.filter((b) => !refs.has(b.url)).length;
  const planBytes = jobs.reduce((s, j) => s + j.blob.size, 0);
  const alreadyDone = Object.values(state.entries).filter((e) => e.done).length;

  console.log(`\nPlan: copy ${jobs.length} video(s), ${mb(planBytes)} → B2${alreadyDone ? ` (${alreadyDone} already done, skipped)` : ""}.`);
  if (orphanCount && !opts.includeOrphans) console.log(`      ${orphanCount} orphan blob(s) skipped (add --include-orphans to copy them too).`);
  for (const j of jobs) console.log(`  ${mb(j.blob.size).padStart(10)}  ${j.blob.pathname}  ${j.projects.length ? `→ ${j.projects.join(", ")}` : "(orphan)"}`);

  if (!opts.confirm) {
    if (!b2) console.log(`\nNote: --confirm will also need ${missing.join(", ")}.`);
    console.log("\nDry run complete. Nothing was written.");
    return 0;
  }
  if (!b2) return 1; // unreachable (checked above); narrows the type

  // ---- Migrate --------------------------------------------------------------
  let s3;
  try {
    s3 = await connectS3(b2);
  } catch (e) {
    console.error(errMsg(e));
    return 1;
  }

  /** @type {{ url: string, error: string }[]} */
  const failures = [];
  let migratedCount = 0;
  let migratedBytes = 0;
  let rewrites = 0;

  for (const [i, job] of jobs.entries()) {
    if (interrupted) break;
    const { blob } = job;
    console.log(`\n[${i + 1}/${jobs.length}] ${blob.pathname} (${mb(blob.size)})${job.projects.length ? ` — ${job.projects.join(", ")}` : " — orphan"}`);
    try {
      let entry = state.entries[blob.url];
      if (!entry?.uploaded) {
        const key = newKey(blob.pathname);
        const newUrl = `${b2.publicBase}/${key}`;
        const { sourceSize } = await copyBlobToB2(s3, blob, key);
        await verifyObject(s3, key, sourceSize);
        console.log(`  verified ${key} (${sourceSize} bytes)`);
        entry = {
          key, newUrl, size: sourceSize, uploaded: true, rewritten: false, done: false,
          projects: job.projects, orphan: job.projects.length === 0, updatedAt: new Date().toISOString(),
        };
        state.entries[blob.url] = entry;
        await saveState(state);
      } else {
        // Uploaded on an earlier run (or rolled back): re-verify instead of re-uploading.
        await verifyObject(s3, entry.key, entry.size);
        console.log(`  already on B2, re-verified ${entry.key}`);
      }

      if (!entry.orphan) {
        const n = await rewriteProjects(blob.url, entry.newUrl);
        if (n === 0) console.warn("  data/projects.ts no longer contains this URL (edited meanwhile?) — nothing rewritten.");
        else console.log(`  data/projects.ts: replaced ${n} occurrence(s) → ${entry.newUrl}`);
        rewrites += n;
      } else {
        console.log(`  orphan copied → ${entry.newUrl}`);
      }
      entry.rewritten = !entry.orphan;
      entry.done = true;
      entry.updatedAt = new Date().toISOString();
      await saveState(state);
      migratedCount++;
      migratedBytes += entry.size;
    } catch (e) {
      const msg = errMsg(e);
      console.error(`  FAILED: ${msg}`);
      failures.push({ url: blob.url, error: msg });
      await saveState(state).catch(() => {});
    }
  }

  // ---- Optional source deletion ----------------------------------------------
  if (opts.deleteSource && !interrupted) await deleteSources(state, token);

  // ---- Summary ----------------------------------------------------------------
  console.log("\nSummary");
  console.log(`  migrated:  ${migratedCount} video(s), ${mb(migratedBytes)}`);
  console.log(`  rewritten: ${rewrites} URL occurrence(s) in data/projects.ts`);
  if (backupPath) console.log(`  backup:    ${path.relative(ROOT, backupPath)}  (undo with --rollback)`);
  console.log(`  state:     ${path.relative(ROOT, STATE_FILE)}`);
  if (failures.length) {
    console.log(`  FAILED:    ${failures.length}`);
    for (const f of failures) console.log(`    ${f.url}\n      ${f.error}`);
  }
  if (rewrites) console.log(`\n${DONE_MESSAGE}`);
  return failures.length || interrupted ? 1 : 0;
}

/**
 * Null when the rewritten data/projects.ts is committed and pushed (so the
 * next deploy serves the B2 URLs); otherwise why deletion must wait.
 */
function unpublishedReason() {
  try {
    if (git(["status", "--porcelain", "--", "data/projects.ts"])) {
      return "data/projects.ts has uncommitted changes — commit and push the rewritten URLs first";
    }
    if (git(["log", "--oneline", "@{u}..HEAD", "--", "data/projects.ts"])) {
      return "data/projects.ts has commits that aren't pushed yet — push them first";
    }
    return null;
  } catch {
    return "couldn't confirm with git that data/projects.ts is committed and pushed (no git / no upstream branch)";
  }
}

/** Admin backup snapshots that still mention `url`. */
async function backupsReferencing(/** @type {string} */ url) {
  if (!existsSync(ADMIN_BACKUPS_DIR)) return [];
  const hits = [];
  for (const f of await readdir(ADMIN_BACKUPS_DIR)) {
    if (!f.endsWith(".ts")) continue;
    if ((await readFile(path.join(ADMIN_BACKUPS_DIR, f), "utf8")).includes(url)) hits.push(f);
  }
  return hits;
}

/**
 * Deletes verified, no-longer-referenced source blobs after an interactive
 * DELETE — only once the rewrite is committed and pushed, because until the
 * new data/projects.ts deploys the live site still plays the Blob URLs.
 */
async function deleteSources(/** @type {State} */ state, /** @type {string} */ token) {
  const text = await readFile(PROJECTS_FILE, "utf8");
  const candidates = Object.entries(state.entries).filter(([url, e]) => e.done && e.uploaded && !e.sourceDeleted && !text.includes(url));
  if (!candidates.length) {
    console.log("\n--delete-source: nothing eligible (needs a verified copy and no remaining reference).");
    return;
  }
  if (!process.stdin.isTTY) {
    console.log("\n--delete-source: stdin is not a TTY — skipping deletion (it must be confirmed interactively).");
    return;
  }
  const why = unpublishedReason();
  if (why) {
    console.log(`\n--delete-source: skipped — ${why}.`);
    console.log("  The live site keeps playing the Vercel Blob URLs until the new data/projects.ts deploys.");
    console.log("  Once that deploy is live, run: node scripts/migrate-blob-to-b2.mjs --confirm --delete-source");
    return;
  }
  console.log(`\n--delete-source: ${candidates.length} blob(s) are verified on B2 and unreferenced:`);
  for (const [url, e] of candidates) {
    console.log(`  ${mb(e.size).padStart(10)}  ${url}`);
    const snaps = await backupsReferencing(url);
    if (snaps.length) {
      console.log(`              ! still in ${snaps.length} admin backup(s) (e.g. backups/${snaps[0]}) — restoring one would bring back a dead link`);
    }
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("Type DELETE to permanently delete them from Vercel Blob: ")).trim();
  rl.close();
  if (answer !== "DELETE") {
    console.log("  Not deleted.");
    return;
  }
  const { del } = await import("@vercel/blob");
  for (const [url, e] of candidates) {
    try {
      await del(url, { token });
      e.sourceDeleted = true;
      console.log(`  deleted ${url}`);
    } catch (err) {
      console.error(`  could not delete ${url}: ${errMsg(err)}`);
    }
    await saveState(state);
  }
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  /** @type {ReturnType<typeof parseArgs>["values"]} */
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        confirm: { type: "boolean", default: false },
        only: { type: "string" },
        limit: { type: "string" },
        "include-orphans": { type: "boolean", default: false },
        "delete-source": { type: "boolean", default: false },
        rollback: { type: "boolean", default: false },
        force: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
    }));
  } catch (e) {
    console.error(`${errMsg(e)}\n\n${USAGE}`);
    return 2;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (values.force && !values.rollback) {
    console.error("--force only works together with --rollback.");
    return 2;
  }
  if (values.rollback) return rollback(values.force === true);

  let limit;
  if (typeof values.limit === "string") {
    limit = Number(values.limit);
    if (!Number.isInteger(limit) || limit < 1) {
      console.error("--limit must be a positive integer.");
      return 2;
    }
  }
  if (values["delete-source"] && !values.confirm) {
    console.error("--delete-source only works together with --confirm.");
    return 2;
  }

  const loaded = await loadEnvFile();
  if (loaded) console.log("Loaded .env.local\n");
  return migrate({
    confirm: values.confirm === true,
    only: typeof values.only === "string" ? values.only : undefined,
    limit,
    includeOrphans: values["include-orphans"] === true,
    deleteSource: values["delete-source"] === true,
  });
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(`Unexpected error: ${errMsg(e)}`);
    process.exit(1);
  },
);
