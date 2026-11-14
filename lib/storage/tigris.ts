import "server-only";
import type { S3Config } from "@/lib/admin/storage/s3";

/**
 * Tigris (tigrisdata.com) — S3-compatible object storage, the site's media
 * bucket since B2 hit its free download cap. Server-only: reads TIGRIS_* from
 * process.env and never logs them. The generic S3 store
 * (lib/admin/storage/s3.ts, @aws-sdk/client-s3) does the actual work.
 *
 *   TIGRIS_ENDPOINT           https://t3.storage.dev (Tigris' default; use the endpoint the
 *                             console shows with your access key if it differs)
 *   TIGRIS_REGION             auto
 *   TIGRIS_ACCESS_KEY_ID      tid_…
 *   TIGRIS_SECRET_ACCESS_KEY  tsec_…
 *   TIGRIS_BUCKET_NAME        the bucket
 *   TIGRIS_FORCE_PATH_STYLE   optional "true" — path-style addressing (<endpoint>/<bucket>/<key>);
 *                             only if admin → Settings → Storage → Test connection says it's needed
 *
 * Tigris addresses buckets virtual-hosted style (<bucket>.t3.storage.dev), so
 * forcePathStyle is false — unlike B2. Buckets are private by default; every
 * URL the site hands out is a short-lived presigned GET, as before.
 */

export const TIGRIS_DEFAULT_ENDPOINT = "https://t3.storage.dev";
export const TIGRIS_DEFAULT_REGION = "auto";

export type TigrisCredentials = {
  endpoint?: string;
  region?: string;
  /** Default false (virtual-hosted, Tigris' documented style). */
  forcePathStyle?: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function normalizeEndpoint(raw: string): string {
  const value = raw || TIGRIS_DEFAULT_ENDPOINT;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withScheme.replace(/\/+$/, "");
}

/** An S3 config for Tigris from explicit credentials (admin → Settings → Storage → Test connection). */
export function tigrisConfigFrom(c: TigrisCredentials): S3Config {
  return {
    endpoint: normalizeEndpoint((c.endpoint ?? "").trim()),
    region: (c.region ?? "").trim() || TIGRIS_DEFAULT_REGION,
    accessKeyId: c.accessKeyId.trim(),
    secretAccessKey: c.secretAccessKey.trim(),
    bucket: c.bucket.trim(),
    forcePathStyle: c.forcePathStyle ?? false,
  };
}

/** The deployment's Tigris config, or null when a required variable is missing. */
export function tigrisConfig(): S3Config | null {
  const accessKeyId = env("TIGRIS_ACCESS_KEY_ID");
  const secretAccessKey = env("TIGRIS_SECRET_ACCESS_KEY");
  const bucket = env("TIGRIS_BUCKET_NAME");
  if (!accessKeyId || !secretAccessKey || !bucket) return null;
  return tigrisConfigFrom({
    endpoint: env("TIGRIS_ENDPOINT"),
    region: env("TIGRIS_REGION"),
    accessKeyId,
    secretAccessKey,
    bucket,
    forcePathStyle: /^(1|true|yes)$/i.test(env("TIGRIS_FORCE_PATH_STYLE")),
  });
}

export function isTigrisConfigured(): boolean {
  return tigrisConfig() !== null;
}
