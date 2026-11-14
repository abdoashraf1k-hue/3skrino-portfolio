import "server-only";
import { GetBucketCorsCommand, GetObjectCommand, HeadBucketCommand, ListObjectsV2Command, PutBucketCorsCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { tigrisConfig, tigrisConfigFrom, type TigrisCredentials } from "@/lib/storage/tigris";
import { describeS3Error, logS3Error, toStorageError } from "./bucket";
import { clientFor, type S3Config } from "./s3";
import { StorageError } from "./types";

/**
 * Sprint 15.5 — admin → Settings → Storage → Tigris: "Test connection" and
 * "Apply CORS". Works with keys pasted into the form (used for this request
 * only — never stored, never logged, never echoed back) or, when the form is
 * empty, the deployment's TIGRIS_* env vars.
 *
 * The probe object lives under _conntest/ (outside the site's key pattern,
 * so /media never serves it) and is overwritten by every test.
 */

export type ConnStep = { step: string; ok: boolean; detail: string };
export type ConnTestResult = {
  ok: boolean;
  source: "form" | "env";
  bucket: string;
  endpointHost: string;
  steps: ConnStep[];
  /** Presigned GET for the probe (2 min): the browser fetches it with CORS to check the bucket's CORS from a real origin. */
  probeUrl?: string;
  /** What the probe contains, so the browser can confirm it read the right bytes. */
  probeText?: string;
};

const PROBE_KEY = "_conntest/probe.txt";

/** Origins the bucket must allow: the site, its known domains, local dev, and whoever is asking. */
export function siteOrigins(requestOrigin: string | null): string[] {
  const out = new Set<string>(["https://3skrino-portfolio.vercel.app", "https://3skrino.com", "https://www.3skrino.com", "http://localhost:3000"]);
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  for (const raw of [site, requestOrigin ?? ""]) {
    try {
      if (raw) out.add(new URL(raw).origin);
    } catch {
      /* not a URL */
    }
  }
  return [...out];
}

function resolve(creds: Partial<TigrisCredentials> | undefined): { cfg: S3Config; source: "form" | "env" } {
  const filled = creds && creds.accessKeyId?.trim() && creds.secretAccessKey?.trim() && creds.bucket?.trim();
  if (filled) return { cfg: tigrisConfigFrom(creds as TigrisCredentials), source: "form" };
  if (creds && (creds.accessKeyId?.trim() || creds.secretAccessKey?.trim() || creds.bucket?.trim())) {
    throw new StorageError("Fill in the access key ID, secret access key and bucket name — or clear the form to test the deployed TIGRIS_* variables", 400);
  }
  const env = tigrisConfig();
  if (!env) throw new StorageError("Paste your Tigris keys into the form (TIGRIS_* isn't set on this deployment yet)", 400);
  return { cfg: env, source: "env" };
}

const host = (endpoint: string) => {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
};

const message = (err: unknown) => toStorageError(err, "tigris").message;

/** The SDK's own words for a failure: code, HTTP status, request id. */
function sdkWords(err: unknown): string {
  const d = describeS3Error(err);
  return `${d.code || d.name}${d.status ? ` · HTTP ${d.status}` : ""}${d.message && d.message !== "UnknownError" ? ` · “${d.message}”` : ""}${d.requestId ? ` · request ${d.requestId}` : ""}`;
}

const ENDPOINTS = ["https://t3.storage.dev", "https://fly.storage.tigris.dev"];
const BUCKET_NAME = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

/**
 * Why did HeadBucket get a 403? Runs only after it failed:
 *   - the real error code, from a ListObjectsV2 (its response has a body),
 *   - key / bucket-name format checks (swapped or mis-pasted keys are common),
 *   - the server's clock against Tigris' (signatures expire after 15 min of skew),
 *   - every endpoint × addressing-style combination, to find one that works.
 * Every line also goes to console.error (Vercel → Logs). Secrets never appear.
 */
async function diagnose(cfg: S3Config): Promise<{ listWorks: boolean; steps: ConnStep[] }> {
  const steps: ConnStep[] = [];
  const say = (step: string, ok: boolean, detail: string) => {
    steps.push({ step, ok, detail });
    console.error(`[storage] diagnose · ${step}: ${ok ? "ok" : "PROBLEM"} — ${detail}`);
  };

  // a. The real error, same settings.
  let listWorks = false;
  try {
    await clientFor(cfg).send(new ListObjectsV2Command({ Bucket: cfg.bucket, MaxKeys: 1 }));
    listWorks = true;
    say("Real cause", true, "ListObjectsV2 works with these exact settings — only HeadBucket is refused");
  } catch (err) {
    logS3Error(`Tigris ListObjectsV2 "${cfg.bucket}"`, err);
    say("Real cause", false, `${message(err)} [${sdkWords(err)}]`);
  }
  if (listWorks) return { listWorks, steps };

  // b. Key and bucket formats (Tigris keys: tid_… / tsec_…).
  const id = cfg.accessKeyId;
  const secret = cfg.secretAccessKey;
  const problems: string[] = [];
  if (id.startsWith("tsec_")) problems.push("the ID field holds the secret (tsec_…) — the two keys are swapped");
  else if (!id.startsWith("tid_")) problems.push(`the access key ID should start with "tid_" (it starts with "${id.slice(0, 4)}")`);
  if (secret.startsWith("tid_")) problems.push("the secret field holds the key ID (tid_…)");
  else if (!secret.startsWith("tsec_")) problems.push(`the secret should start with "tsec_" (${secret.length} characters were sent)`);
  if (/\s/.test(id) || /\s/.test(secret)) problems.push("a key contains a space or line break inside it");
  if (/["']/.test(id + secret)) problems.push("a key contains quote marks — paste the bare value");
  if (!BUCKET_NAME.test(cfg.bucket)) problems.push(`the bucket name "${cfg.bucket}" isn't a valid lowercase bucket name`);
  say(
    "Key format",
    !problems.length,
    problems.length ? problems.join(" · ") : `ID ${id.slice(0, 8)}… (${id.length} chars), secret ${secret.length} chars, bucket "${cfg.bucket}" — format looks right`,
  );

  // c. Clock skew.
  try {
    const res = await fetch(cfg.endpoint, { method: "HEAD", cache: "no-store" });
    const date = res.headers.get("date");
    if (date) {
      const skew = Math.round((Date.now() - Date.parse(date)) / 1000);
      say("Server clock", Math.abs(skew) < 300, Math.abs(skew) < 300 ? `in sync with Tigris (${skew >= 0 ? "+" : ""}${skew}s)` : `${skew}s off Tigris' clock — signatures fail past 15 min`);
    }
  } catch {
    say("Server clock", false, `couldn't reach ${host(cfg.endpoint)} at all — network / DNS problem`);
  }

  // d. Every endpoint × addressing style.
  const endpoints = [...new Set([cfg.endpoint, ...ENDPOINTS])];
  const combos = endpoints.flatMap((endpoint) => [false, true].map((forcePathStyle) => ({ ...cfg, endpoint, forcePathStyle })));
  const results = await Promise.all(
    combos.map(async (c) => {
      try {
        await clientFor(c).send(new ListObjectsV2Command({ Bucket: c.bucket, MaxKeys: 1 }));
        return { c, ok: true, why: "" };
      } catch (err) {
        return { c, ok: false, why: describeS3Error(err).code || describeS3Error(err).name };
      }
    }),
  );
  const label = (c: S3Config) => `${host(c.endpoint)} ${c.forcePathStyle ? "path-style" : "virtual-hosted"}`;
  const working = results.find((r) => r.ok);
  if (working) {
    const w = working.c;
    say(
      "Endpoint & addressing",
      false,
      `these keys WORK on ${label(w)} — set the form's Endpoint to ${w.endpoint}${w.forcePathStyle ? " and tick Path-style" : ""}, and on Vercel TIGRIS_ENDPOINT=${w.endpoint}${w.forcePathStyle ? " + TIGRIS_FORCE_PATH_STYLE=true" : ""}`,
    );
  } else {
    say("Endpoint & addressing", false, `refused on every combination — ${results.map((r) => `${label(r.c)}: ${r.why}`).join(" · ")}`);
  }
  return { listWorks, steps };
}

export async function testConnection(creds: Partial<TigrisCredentials> | undefined, requestOrigin: string | null): Promise<ConnTestResult> {
  const { cfg, source } = resolve(creds);
  const client = clientFor(cfg);
  const Bucket = cfg.bucket;
  const steps: ConnStep[] = [];
  const result: ConnTestResult = { ok: false, source, bucket: Bucket, endpointHost: host(cfg.endpoint), steps };

  // 1. Keys + bucket
  try {
    await client.send(new HeadBucketCommand({ Bucket }));
    steps.push({ step: "Keys & bucket", ok: true, detail: `"${Bucket}" is reachable with these keys` });
  } catch (err) {
    logS3Error(`Tigris HeadBucket "${Bucket}" on ${host(cfg.endpoint)}${cfg.forcePathStyle ? " (path-style)" : ""}`, err);
    if (describeS3Error(err).status === 404) {
      steps.push({ step: "Keys & bucket", ok: false, detail: `No bucket named "${Bucket}" — create it at storage.new, or fix the name` });
      return result;
    }
    // HEAD responses have no body, so this 403 doesn't say why. Ask in a way that does.
    const diagnosis = await diagnose(cfg);
    steps.push(...diagnosis.steps);
    if (!diagnosis.listWorks) return result;
    // Listing works with these exact settings: only HeadBucket is refused — not something the site needs.
    steps.push({ step: "Keys & bucket", ok: true, detail: "HeadBucket is refused but listing works — the site doesn't need HeadBucket, continuing" });
  }

  // 2. Write
  const probeText = `3skrino connection test ${new Date().toISOString()}`;
  try {
    await client.send(new PutObjectCommand({ Bucket, Key: PROBE_KEY, Body: probeText, ContentType: "text/plain" }));
    steps.push({ step: "Write", ok: true, detail: "Uploaded a probe object (_conntest/probe.txt)" });
  } catch (err) {
    logS3Error(`Tigris PutObject probe "${Bucket}"`, err);
    steps.push({ step: "Write", ok: false, detail: `${message(err)} — the key needs ReadWrite (or Editor) on this bucket [${sdkWords(err)}]` });
    return result;
  }

  // 3. Presigned read (exactly how /media serves visitors)
  try {
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket, Key: PROBE_KEY }), { expiresIn: 120 });
    const res = await fetch(url, { cache: "no-store" });
    const body = await res.text();
    if (!res.ok || body !== probeText) throw new Error(`HTTP ${res.status}`);
    steps.push({ step: "Presigned read", ok: true, detail: "A presigned GET returned the probe — /media will work" });
    result.probeUrl = url;
    result.probeText = probeText;
  } catch (err) {
    steps.push({ step: "Presigned read", ok: false, detail: `Presigned GET failed (${err instanceof Error ? err.message : "error"})` });
    return result;
  }

  // 4. CORS rules (the browser uploads straight to the bucket and the hologram reads frames with CORS)
  const origins = siteOrigins(requestOrigin);
  try {
    const cors = await client.send(new GetBucketCorsCommand({ Bucket }));
    const rules = cors.CORSRules ?? [];
    const allows = (origin: string, method: string) =>
      rules.some((r) => (r.AllowedOrigins ?? []).some((o) => o === "*" || o === origin) && (r.AllowedMethods ?? []).includes(method));
    const etag = rules.some((r) => (r.ExposeHeaders ?? []).some((h) => h.toLowerCase() === "etag"));
    const missing = origins.filter((o) => !allows(o, "GET") || !allows(o, "PUT"));
    const ok = rules.length > 0 && !missing.length && etag;
    steps.push({
      step: "CORS",
      ok,
      detail: ok
        ? `GET + PUT allowed from ${origins.length} site origins, ETag exposed`
        : !rules.length
          ? "No CORS rules yet — click “Apply CORS” (uploads and the hologram need it)"
          : `${missing.length ? `Missing GET/PUT for ${missing.join(", ")}` : ""}${!etag ? `${missing.length ? " · " : ""}ETag isn't exposed` : ""} — click “Apply CORS”`,
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    steps.push({
      step: "CORS",
      ok: false,
      detail: name === "NoSuchCORSConfiguration" ? "No CORS rules yet — click “Apply CORS” (uploads and the hologram need it)" : `Couldn't read CORS (${message(err)})`,
    });
  }

  result.ok = steps.every((s) => s.ok);
  return result;
}

/** Writes the site's CORS rule: GET / HEAD / PUT from every site origin, any header, ETag exposed (multipart needs it). */
export async function applyCors(creds: Partial<TigrisCredentials> | undefined, requestOrigin: string | null): Promise<{ origins: string[] }> {
  const { cfg } = resolve(creds);
  const origins = siteOrigins(requestOrigin);
  try {
    await clientFor(cfg).send(
      new PutBucketCorsCommand({
        Bucket: cfg.bucket,
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
  } catch (err) {
    throw toStorageError(err, "tigris");
  }
  return { origins };
}
