import "server-only";
import { GetBucketCorsCommand, GetObjectCommand, HeadBucketCommand, PutBucketCorsCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { tigrisConfig, tigrisConfigFrom, type TigrisCredentials } from "@/lib/storage/tigris";
import { toStorageError } from "./bucket";
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
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    steps.push({
      step: "Keys & bucket",
      ok: false,
      detail: status === 404 ? `No bucket named "${Bucket}" — create it at storage.new, or fix the name` : message(err),
    });
    return result;
  }

  // 2. Write
  const probeText = `3skrino connection test ${new Date().toISOString()}`;
  try {
    await client.send(new PutObjectCommand({ Bucket, Key: PROBE_KEY, Body: probeText, ContentType: "text/plain" }));
    steps.push({ step: "Write", ok: true, detail: "Uploaded a probe object (_conntest/probe.txt)" });
  } catch (err) {
    steps.push({ step: "Write", ok: false, detail: `${message(err)} — the key needs ReadWrite (or Editor) on this bucket` });
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
