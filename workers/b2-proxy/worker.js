/**
 * Cloudflare Worker: read-only proxy in front of the PRIVATE media bucket —
 * Tigris since Sprint 15.5 (Backblaze B2 still works as a fallback).
 * Single file, no dependencies — paste it into the Cloudflare dashboard editor.
 *
 *   GET <worker>/videos/<key>.mp4  ──▶  edge cache hit?  ──yes──▶ 200 / 206 from Cloudflare (bucket untouched)
 *                                          │ no
 *                                          ▼
 *                                   SigV4-signed GET to the bucket, Range forwarded ──▶ 206 to the viewer
 *                                   + (background) whole file into the edge cache
 *
 * Only keys the site itself produces are served (same pattern as
 * lib/admin/storage/contract.ts KEY_PATTERN); everything else is 404.
 *
 * Settings → Variables and Secrets — Tigris (used whenever TIGRIS_ACCESS_KEY_ID is set):
 *   TIGRIS_ENDPOINT           https://t3.storage.dev                (text, optional — this is the default)
 *   TIGRIS_REGION             auto                                  (text, optional)
 *   TIGRIS_BUCKET_NAME        your bucket                           (text)
 *   TIGRIS_ACCESS_KEY_ID      tid_…                                 (secret)
 *   TIGRIS_SECRET_ACCESS_KEY  tsec_…                                (secret)
 * …or the legacy Backblaze B2 set:
 *   B2_ENDPOINT     e.g. https://s3.eu-central-003.backblazeb2.com   (text)
 *   B2_BUCKET_NAME  e.g. 3skrino-videos-2026                          (text)
 *   B2_KEY_ID       application key id                               (secret)
 *   B2_APP_KEY      application key                                  (secret)
 *
 * Tigris addresses buckets virtual-hosted style (<bucket>.t3.storage.dev/<key>),
 * B2 path style (s3.<region>.backblazeb2.com/<bucket>/<key>).
 */

const KEY_PATTERN = /^(videos|thumbnails|brands|hero|site|audio)\/\d{10,16}-[a-z0-9-]{6,40}\.[a-z0-9]{2,5}$/;
/** Free-plan cache objects max out at 512 MB; bigger files stream through uncached. */
const MAX_CACHE_BYTES = 500 * 1024 * 1024;
const IMMUTABLE = "public, max-age=31536000, immutable";

/* ------------------------- AWS SigV4 (S3, GET/HEAD) ------------------------- */

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", typeof key === "string" ? enc.encode(key) : key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(data));
}

/** Where to sign: Tigris when its keys are set, else B2. */
function upstreamOf(env) {
  const objectPath = key => key.split("/").map(encodeURIComponent).join("/");
  if (env.TIGRIS_ACCESS_KEY_ID) {
    const raw = env.TIGRIS_ENDPOINT || "https://t3.storage.dev";
    const base = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return {
      name: "Tigris",
      // Virtual-hosted: <bucket>.<endpoint host>/<key>
      origin: `${base.protocol}//${env.TIGRIS_BUCKET_NAME}.${base.host}`,
      host: `${env.TIGRIS_BUCKET_NAME}.${base.host}`,
      path: (key) => `/${objectPath(key)}`,
      region: env.TIGRIS_REGION || "auto",
      keyId: env.TIGRIS_ACCESS_KEY_ID,
      secret: env.TIGRIS_SECRET_ACCESS_KEY,
    };
  }
  const endpoint = new URL(env.B2_ENDPOINT.startsWith("http") ? env.B2_ENDPOINT : `https://${env.B2_ENDPOINT}`);
  return {
    name: "B2",
    origin: endpoint.origin,
    host: endpoint.host,
    path: (key) => `/${env.B2_BUCKET_NAME}/${objectPath(key)}`,
    region: /^s3\.([a-z0-9-]+)\.backblazeb2\.com$/i.exec(endpoint.hostname)?.[1] ?? "us-east-1",
    keyId: env.B2_KEY_ID,
    secret: env.B2_APP_KEY,
  };
}

async function signedRequest(env, key, method, range) {
  const up = upstreamOf(env);
  const region = up.region;
  const path = up.path(key);
  const amzDate = new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const payload = "UNSIGNED-PAYLOAD";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonical = [method, path, "", `host:${up.host}`, `x-amz-content-sha256:${payload}`, `x-amz-date:${amzDate}`, "", signedHeaders, payload].join("\n");
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256(canonical)].join("\n");
  let k = await hmac(`AWS4${up.secret}`, day);
  for (const part of [region, "s3", "aws4_request"]) k = await hmac(k, part);
  const signature = hex(await hmac(k, toSign));

  const headers = new Headers({
    "x-amz-content-sha256": payload,
    "x-amz-date": amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${up.keyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  });
  if (range) headers.set("Range", range);
  return new Request(`${up.origin}${path}`, { method, headers });
}

/* --------------------------------- Proxy --------------------------------- */

function withHeaders(res, extra) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(extra)) out.headers.set(k, v);
  return out;
}

const PUBLIC_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
  "Cache-Control": IMMUTABLE,
  "Accept-Ranges": "bytes",
};

/** Copies the whole object into the edge cache (keys are never reused, so it never goes stale). */
async function fillCache(env, key, cacheKey, size) {
  if (!size || size > MAX_CACHE_BYTES) return;
  const res = await fetch(await signedRequest(env, key, "GET"));
  if (res.status !== 200) return;
  const stored = new Response(res.body, res);
  stored.headers.set("Cache-Control", IMMUTABLE);
  stored.headers.set("Accept-Ranges", "bytes");
  await caches.default.put(cacheKey, stored);
}

const worker = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...PUBLIC_HEADERS, "Access-Control-Allow-Methods": "GET, HEAD", "Access-Control-Allow-Headers": "Range" } });
    }
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });

    const url = new URL(request.url);
    let key;
    try {
      key = decodeURIComponent(url.pathname.slice(1));
    } catch {
      return new Response("Not found", { status: 404 });
    }
    if (!KEY_PATTERN.test(key)) return new Response("Not found", { status: 404 });

    // One cache entry per file — the player's ?r= cache-busters are ignored.
    const cacheKey = new Request(`${url.origin}/${key}`);
    const range = request.headers.get("Range");

    // cache.match answers Range requests from the cached full file (206) by itself.
    const hit = await caches.default.match(new Request(cacheKey, { headers: range ? { Range: range } : {} }));
    if (hit) return withHeaders(hit, { ...PUBLIC_HEADERS, "X-Proxy-Cache": "HIT" });

    const upstream = await fetch(await signedRequest(env, key, request.method, range));
    if (upstream.status === 404) return new Response("Not found", { status: 404 });
    if (upstream.status === 403) {
      // B2 answers 403 both for bad credentials and for "daily download / Class B cap exceeded".
      const body = await upstream.text();
      const capped = /cap exceeded/i.test(body);
      const up = upstreamOf(env);
      const creds = up.name === "Tigris" ? "TIGRIS_ACCESS_KEY_ID / TIGRIS_SECRET_ACCESS_KEY" : "B2_KEY_ID / B2_APP_KEY";
      return new Response(capped ? `${up.name} daily download cap exceeded — resets at 00:00 UTC` : `${up.name} rejected the request — check ${creds}`, {
        status: capped ? 503 : 502,
        headers: { "Cache-Control": "no-store", ...(capped ? { "Retry-After": "3600" } : {}) },
      });
    }
    if (!upstream.ok) return new Response(`Upstream error (${upstream.status})`, { status: 502 });

    // Total size: from Content-Range on a 206 ("bytes 0-1/12345"), else Content-Length.
    const total = Number(upstream.headers.get("Content-Range")?.split("/")[1] ?? upstream.headers.get("Content-Length") ?? 0);
    if (request.method === "GET") ctx.waitUntil(fillCache(env, key, cacheKey, total).catch(() => undefined));

    return withHeaders(upstream, { ...PUBLIC_HEADERS, "X-Proxy-Cache": "MISS" });
  },
};

export default worker;
