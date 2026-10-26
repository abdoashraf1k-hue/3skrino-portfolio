/**
 * Cloudflare Worker: read-only proxy in front of the PRIVATE B2 bucket.
 * Single file, no dependencies — paste it into the Cloudflare dashboard editor.
 *
 *   GET <worker>/videos/<key>.mp4  ──▶  edge cache hit?  ──yes──▶ 200 / 206 from Cloudflare (B2 untouched)
 *                                          │ no
 *                                          ▼
 *                                   SigV4-signed GET to B2, Range forwarded ──▶ 206 to the viewer
 *                                   + (background) whole file into the edge cache
 *
 * Only keys the site itself produces are served (same pattern as
 * lib/admin/storage/contract.ts KEY_PATTERN); everything else is 404.
 *
 * Settings → Variables and Secrets:
 *   B2_ENDPOINT     e.g. https://s3.eu-central-003.backblazeb2.com   (text)
 *   B2_BUCKET_NAME  e.g. 3skrino-videos-2026                          (text)
 *   B2_KEY_ID       application key id                               (secret)
 *   B2_APP_KEY      application key                                  (secret)
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

async function signedB2Request(env, key, method, range) {
  const endpoint = new URL(env.B2_ENDPOINT.startsWith("http") ? env.B2_ENDPOINT : `https://${env.B2_ENDPOINT}`);
  const region = /^s3\.([a-z0-9-]+)\.backblazeb2\.com$/i.exec(endpoint.hostname)?.[1] ?? "us-east-1";
  const path = `/${env.B2_BUCKET_NAME}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const amzDate = new Date().toISOString().replace(/[-:]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const payload = "UNSIGNED-PAYLOAD";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonical = [method, path, "", `host:${endpoint.host}`, `x-amz-content-sha256:${payload}`, `x-amz-date:${amzDate}`, "", signedHeaders, payload].join("\n");
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256(canonical)].join("\n");
  let k = await hmac(`AWS4${env.B2_APP_KEY}`, day);
  for (const part of [region, "s3", "aws4_request"]) k = await hmac(k, part);
  const signature = hex(await hmac(k, toSign));

  const headers = new Headers({
    "x-amz-content-sha256": payload,
    "x-amz-date": amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${env.B2_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  });
  if (range) headers.set("Range", range);
  return new Request(`${endpoint.origin}${path}`, { method, headers });
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
  const res = await fetch(await signedB2Request(env, key, "GET"));
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

    const upstream = await fetch(await signedB2Request(env, key, request.method, range));
    if (upstream.status === 404) return new Response("Not found", { status: 404 });
    if (upstream.status === 403) {
      // B2 answers 403 both for bad credentials and for "daily download / Class B cap exceeded".
      const body = await upstream.text();
      const capped = /cap exceeded/i.test(body);
      return new Response(capped ? "B2 daily download cap exceeded — resets at 00:00 UTC" : "B2 rejected the request — check B2_KEY_ID / B2_APP_KEY", {
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
