/**
 * Sprint 15.5 — copies every media object from Backblaze B2 to Tigris.
 *
 *   node scripts/migrate-b2-to-tigris.mjs                  # DRY RUN: sizes, what's left to copy, free-tier check
 *   node scripts/migrate-b2-to-tigris.mjs --confirm        # copy (images first, videos last), verify each
 *   node scripts/migrate-b2-to-tigris.mjs --confirm --only=hero,brands,site,thumbnails,audio
 *   node scripts/migrate-b2-to-tigris.mjs --confirm --max-gb=0.9   # stop after ~0.9 GB downloaded from B2
 *   node scripts/migrate-b2-to-tigris.mjs --cors           # (also) set the site's CORS rule on the Tigris bucket
 *   node scripts/migrate-b2-to-tigris.mjs --help
 *
 * Why it's safe to run more than once:
 *   - Object keys are identical on both sides, and the site stores URLs as
 *     <site>/media/<key> — so NOTHING in data/ is rewritten. Once a key exists
 *     in Tigris and TIGRIS_* is set on Vercel, /media serves it from Tigris.
 *   - Objects already in Tigris with the same size are skipped: re-run after a
 *     B2 cap reset and it continues where it stopped.
 *   - Each copy is verified (HeadObject size === B2 size) before it counts.
 *   - B2 is never written to or deleted from.
 *   - When B2 answers "cap exceeded" the script stops cleanly and tells you
 *     to re-run after 00:00 UTC.
 *
 * Order: the site's images and sounds first (hero frames, logos, thumbnails,
 * site images, audio — small, and what makes the pages look right), videos last.
 *
 * Env (.env.local, .env or the shell):
 *   B2_ENDPOINT, B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME (B2_REGION optional)
 *   TIGRIS_ACCESS_KEY_ID, TIGRIS_SECRET_ACCESS_KEY, TIGRIS_BUCKET_NAME
 *   TIGRIS_ENDPOINT (default https://t3.storage.dev), TIGRIS_REGION (default auto)
 *
 * Deps: @aws-sdk/client-s3 (already installed).
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GB = 1024 ** 3;
const MB = 1024 ** 2;
/** Tigris' free tier: 5 GB of storage per month (pricing page, Nov 2026). */
const TIGRIS_FREE_BYTES = 5 * GB;
/** Copy order: what makes the site look right first. */
const FOLDER_ORDER = ["hero", "brands", "site", "thumbnails", "audio", "videos"];
const IMMUTABLE = "public, max-age=31536000, immutable";
/** Mirrors the site's CORS needs (lib/admin/storage/conntest.ts). */
const DEFAULT_ORIGINS = ["https://3skrino-portfolio.vercel.app", "https://3skrino.com", "https://www.3skrino.com", "http://localhost:3000"];

const HELP = `Copy media from Backblaze B2 to Tigris (keys stay the same; site URLs don't change).

  node scripts/migrate-b2-to-tigris.mjs [--confirm] [--only=folders] [--max-gb=N] [--concurrency=N] [--cors]

  (no flags)      dry run: what's in each bucket, what's left to copy, free-tier check
  --confirm       copy for real (skips anything already in Tigris with the same size)
  --only=a,b      only these folders (hero, brands, site, thumbnails, audio, videos)
  --max-gb=N      stop once ~N GB has been downloaded from B2 this run (B2 cap budget)
  --concurrency=N parallel copies (default 3)
  --cors          set the site's CORS rule on the Tigris bucket (GET/HEAD/PUT from the
                  site origins + NEXT_PUBLIC_SITE_URL, ETag exposed) — the admin's
                  Settings → Storage → "Apply CORS" does the same
  --help          this text

Env (.env.local or the shell): B2_ENDPOINT, B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME,
TIGRIS_ACCESS_KEY_ID, TIGRIS_SECRET_ACCESS_KEY, TIGRIS_BUCKET_NAME
(TIGRIS_ENDPOINT defaults to https://t3.storage.dev, TIGRIS_REGION to auto).`;

/** Loads KEY=VALUE lines from .env.local, then .env (Next.js precedence), never overriding the real environment. */
async function loadEnvFiles() {
  const loaded = [];
  for (const name of [".env.local", ".env"]) {
    if (await loadEnvFile(path.join(ROOT, name))) loaded.push(name);
  }
  return loaded;
}

async function loadEnvFile(file) {
  if (!existsSync(file)) return false;
  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let value = m[2].replace(/\s+#.*$/, "");
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
  return true;
}

const env = (name) => (process.env[name] ?? "").trim();
const fmt = (bytes) => (bytes >= GB ? `${(bytes / GB).toFixed(2)} GB` : `${(bytes / MB).toFixed(1)} MB`);
const withScheme = (raw) => (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).replace(/\/+$/, "");

function b2Config() {
  const endpoint = env("B2_ENDPOINT");
  const missing = ["B2_ENDPOINT", "B2_KEY_ID", "B2_APP_KEY", "B2_BUCKET_NAME"].filter((k) => !env(k));
  if (missing.length) return { missing };
  const url = withScheme(endpoint);
  const region = env("B2_REGION") || /^s3\.([a-z0-9-]+)\.backblazeb2\.com$/i.exec(new URL(url).hostname)?.[1] || "us-east-1";
  return { endpoint: url, region, accessKeyId: env("B2_KEY_ID"), secretAccessKey: env("B2_APP_KEY"), bucket: env("B2_BUCKET_NAME"), forcePathStyle: true };
}

function tigrisConfig() {
  const missing = ["TIGRIS_ACCESS_KEY_ID", "TIGRIS_SECRET_ACCESS_KEY", "TIGRIS_BUCKET_NAME"].filter((k) => !env(k));
  if (missing.length) return { missing };
  return {
    endpoint: withScheme(env("TIGRIS_ENDPOINT") || "https://t3.storage.dev"),
    region: env("TIGRIS_REGION") || "auto",
    accessKeyId: env("TIGRIS_ACCESS_KEY_ID"),
    secretAccessKey: env("TIGRIS_SECRET_ACCESS_KEY"),
    bucket: env("TIGRIS_BUCKET_NAME"),
    forcePathStyle: false, // Tigris is virtual-hosted
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      confirm: { type: "boolean", default: false },
      only: { type: "string" },
      "max-gb": { type: "string" },
      concurrency: { type: "string" },
      cors: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  const loaded = await loadEnvFiles();
  if (loaded.length) console.log(`Loaded ${loaded.join(", ")}`);

  const tigris = tigrisConfig();
  if (tigris.missing) {
    console.error(`Missing ${tigris.missing.join(", ")} — add your Tigris keys to .env.local (see --help).`);
    process.exit(1);
  }

  const s3 = await import("@aws-sdk/client-s3");
  const client = (cfg) =>
    new s3.S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      forcePathStyle: cfg.forcePathStyle,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  const dst = client(tigris);

  if (values.cors) {
    const site = env("NEXT_PUBLIC_SITE_URL");
    const origins = [...new Set([...DEFAULT_ORIGINS, ...(site ? [new URL(withScheme(site)).origin] : [])])];
    await dst.send(
      new s3.PutBucketCorsCommand({
        Bucket: tigris.bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: origins,
              AllowedMethods: ["GET", "HEAD", "PUT"],
              AllowedHeaders: ["*"],
              ExposeHeaders: ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
    console.log(`CORS set on ${tigris.bucket}: GET/HEAD/PUT from ${origins.join(", ")}`);
    // A CORS-only run doesn't need the B2 keys.
    if (b2Config().missing) return;
  }

  const b2 = b2Config();
  if (b2.missing) {
    console.error(`Missing ${b2.missing.join(", ")} — the B2 source keys (they're in your old .env.local / Vercel env).`);
    process.exit(1);
  }
  const src = client(b2);

  const list = async (c, Bucket) => {
    const out = new Map();
    let token;
    do {
      const res = await c.send(new s3.ListObjectsV2Command({ Bucket, ContinuationToken: token }));
      for (const o of res.Contents ?? []) if (o.Key) out.set(o.Key, o.Size ?? 0);
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
  };

  console.log(`\nB2      ${b2.bucket} (${new URL(b2.endpoint).host})\nTigris  ${tigris.bucket} (${new URL(tigris.endpoint).host})\n`);
  const [have, already] = await Promise.all([list(src, b2.bucket), list(dst, tigris.bucket)]);

  const only = values.only ? new Set(values.only.split(",").map((s) => s.trim())) : null;
  const folderOf = (key) => key.split("/")[0];
  const rank = (key) => {
    const i = FOLDER_ORDER.indexOf(folderOf(key));
    return i < 0 ? FOLDER_ORDER.length : i;
  };
  const all = [...have].filter(([key]) => !key.startsWith("_conntest/"));
  const todo = all
    .filter(([key, size]) => (!only || only.has(folderOf(key))) && already.get(key) !== size)
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]);

  // Summary per folder
  const byFolder = new Map();
  for (const [key, size] of all) {
    const f = folderOf(key);
    const row = byFolder.get(f) ?? { count: 0, bytes: 0, left: 0, leftBytes: 0 };
    row.count++;
    row.bytes += size;
    if (already.get(key) !== size) {
      row.left++;
      row.leftBytes += size;
    }
    byFolder.set(f, row);
  }
  console.log("folder        files      size     left to copy");
  for (const f of [...byFolder.keys()].sort((a, b) => rank(`${a}/`) - rank(`${b}/`))) {
    const r = byFolder.get(f);
    console.log(`${f.padEnd(12)} ${String(r.count).padStart(6)} ${fmt(r.bytes).padStart(10)}   ${r.left ? `${r.left} (${fmt(r.leftBytes)})` : "done"}`);
  }
  const total = all.reduce((s, [, size]) => s + size, 0);
  const todoBytes = todo.reduce((s, [, size]) => s + size, 0);
  console.log(`\ntotal        ${String(all.length).padStart(6)} ${fmt(total).padStart(10)}   ${todo.length} file(s), ${fmt(todoBytes)} to copy${only ? ` (only: ${[...only].join(", ")})` : ""}`);

  if (total > TIGRIS_FREE_BYTES) {
    const images = all.filter(([k]) => folderOf(k) !== "videos").reduce((s, [, size]) => s + size, 0);
    console.log(
      `\n⚠  ${fmt(total)} is over Tigris' 5 GB free storage. Everything except videos is ${fmt(images)}.` +
        `\n   Options: copy everything but videos (--only=hero,brands,site,thumbnails,audio) and keep the biggest` +
        `\n   videos elsewhere, delete unused videos first, or accept Tigris' paid storage beyond 5 GB.`,
    );
  }

  if (!values.confirm) {
    console.log("\nDry run — nothing copied. Add --confirm to copy.");
    return;
  }

  const maxBytes = values["max-gb"] ? Number(values["max-gb"]) * GB : Infinity;
  const concurrency = Math.max(1, Math.min(8, Number(values.concurrency) || 3));
  let downloaded = 0;
  let copied = 0;
  let failed = 0;
  let stopped = "";
  let next = 0;

  const copyOne = async (key, size) => {
    const get = await src.send(new s3.GetObjectCommand({ Bucket: b2.bucket, Key: key }));
    await dst.send(
      new s3.PutObjectCommand({
        Bucket: tigris.bucket,
        Key: key,
        Body: get.Body,
        ContentLength: size,
        ContentType: get.ContentType || "application/octet-stream",
        CacheControl: get.CacheControl || IMMUTABLE,
      }),
    );
    const head = await dst.send(new s3.HeadObjectCommand({ Bucket: tigris.bucket, Key: key }));
    if ((head.ContentLength ?? -1) !== size) throw new Error(`size mismatch after copy (${head.ContentLength} ≠ ${size})`);
  };

  const worker = async () => {
    while (!stopped && next < todo.length) {
      const [key, size] = todo[next++];
      if (downloaded + size > maxBytes) {
        stopped = `--max-gb budget reached (${fmt(downloaded)} downloaded)`;
        return;
      }
      downloaded += size;
      try {
        await copyOne(key, size);
        copied++;
        console.log(`✓ ${key}  ${fmt(size)}  (${copied}/${todo.length})`);
      } catch (err) {
        const text = `${err?.name ?? ""} ${err?.message ?? err}`;
        if (/cap exceeded/i.test(text) || err?.$metadata?.httpStatusCode === 403) {
          stopped = /cap exceeded/i.test(text)
            ? "B2's daily download cap was hit — re-run after 00:00 UTC; finished files are skipped"
            : "B2 or Tigris refused the request (403) — check the keys / the B2 cap";
          return;
        }
        failed++;
        console.error(`✕ ${key}: ${text.trim()}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length || 1) }, worker));

  console.log(`\nCopied ${copied} file(s), ${fmt(downloaded)} read from B2${failed ? `, ${failed} failed (re-run to retry)` : ""}.`);
  if (stopped) console.log(`Stopped: ${stopped}`);
  else if (!failed) console.log("All done. Set TIGRIS_* on Vercel (admin → Settings → Storage → Copy env block) and redeploy — /media then serves from Tigris.");
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
