import "server-only";
import type { S3Config } from "./s3";
import { StorageError } from "./types";

/**
 * Backblaze B2 through its S3-compatible API — config only. Sprint 15.5: the
 * bucket operations moved to ./bucket.ts, which uses Tigris when TIGRIS_* is
 * set and falls back to this B2 config otherwise (and the migration script
 * reads from it). Server-only: reads B2_* from process.env, never logs them.
 *
 *   B2_ENDPOINT     s3.<region>.backblazeb2.com (https:// optional)
 *   B2_REGION       optional — derived from the endpoint when absent
 *   B2_KEY_ID       application key id
 *   B2_APP_KEY      application key
 *   B2_BUCKET_NAME  bucket name
 */

export { StorageError };

const B2_HOST = /^s3\.([a-z0-9-]+)\.backblazeb2\.com$/i;

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function normalizeEndpoint(raw: string): string {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

function regionFromEndpoint(endpoint: string): string {
  try {
    return B2_HOST.exec(new URL(endpoint).hostname)?.[1] ?? "";
  } catch {
    return "";
  }
}

/** The bucket's S3 config, or null when any required variable is missing. */
export function b2Config(): S3Config | null {
  const rawEndpoint = env("B2_ENDPOINT");
  const accessKeyId = env("B2_KEY_ID");
  const secretAccessKey = env("B2_APP_KEY");
  const bucket = env("B2_BUCKET_NAME");
  if (!rawEndpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
  const endpoint = normalizeEndpoint(rawEndpoint);
  const region = env("B2_REGION") || regionFromEndpoint(endpoint);
  if (!region) return null;
  return { endpoint, region, accessKeyId, secretAccessKey, bucket, forcePathStyle: true };
}

export function isB2Configured(): boolean {
  return b2Config() !== null;
}
