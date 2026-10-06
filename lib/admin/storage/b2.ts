import "server-only";
import { createS3Store, type S3Config } from "./s3";
import { StorageError, type BucketUsage, type CompletedPart, type ListedObject, type ObjectInfo, type ObjectStore } from "./types";

/**
 * Backblaze B2 through its S3-compatible API. Server-only: reads B2_* from
 * process.env, never logs them, and turns SDK failures into StorageErrors
 * with messages the admin can act on.
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

function store(): ObjectStore {
  const cfg = b2Config();
  if (!cfg) {
    throw new StorageError(
      "B2 isn't configured — set B2_ENDPOINT, B2_KEY_ID, B2_APP_KEY and B2_BUCKET_NAME (and B2_REGION if the endpoint isn't s3.<region>.backblazeb2.com)",
      503,
    );
  }
  return createS3Store(cfg);
}

const CREDENTIAL_ERRORS = new Set(["AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch", "Forbidden", "Unauthorized"]);
const NETWORK_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "EPIPE"]);

/** SDK / network failure → StorageError with a readable message. Never includes credentials. */
function toStorageError(err: unknown): StorageError {
  if (err instanceof StorageError) return err;
  if (!(err instanceof Error)) return new StorageError("B2 request failed", 502);
  const code = (err as { code?: unknown }).code;
  const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;

  if (err.name === "NoSuchUpload") return new StorageError("That upload expired or was already finished", 404);
  if (err.name === "NoSuchKey" || err.name === "NotFound") return new StorageError("That file isn't in the bucket", 404);
  if (err.name === "NoSuchBucket") return new StorageError("B2 bucket not found — check B2_BUCKET_NAME", 502);
  if (CREDENTIAL_ERRORS.has(err.name) || status === 401 || status === 403) {
    return new StorageError("B2 rejected the credentials — check B2_KEY_ID / B2_APP_KEY", 502);
  }
  if (err.name === "InvalidPart" || err.name === "InvalidPartOrder" || err.name === "EntityTooSmall") {
    return new StorageError(`B2 couldn't assemble the upload (${err.name}) — retry the upload`, 400);
  }
  if (err.name === "TimeoutError" || (typeof code === "string" && NETWORK_CODES.has(code))) {
    return new StorageError("Couldn't reach B2 — check B2_ENDPOINT or retry", 502);
  }
  if (status === 503 || err.name === "SlowDown" || err.name === "ServiceUnavailable") {
    return new StorageError("B2 is busy right now — retry in a moment", 503);
  }
  return new StorageError(`B2 request failed (${status ? `HTTP ${status}` : err.name}) — retry, or check the B2 settings`, 502);
}

/** Runs one store call, mapping any failure. */
async function run<T>(fn: (s: ObjectStore) => Promise<T>): Promise<T> {
  const s = store();
  try {
    return await fn(s);
  } catch (err) {
    throw toStorageError(err);
  }
}

export function getPresignedPutUrl(key: string, contentType: string, contentLength: number): Promise<string> {
  return run((s) => s.presignPut(key, contentType, contentLength));
}

/** Returns the uploadId. */
export function createMultipartUpload(key: string, contentType: string): Promise<string> {
  return run((s) => s.createMultipart(key, contentType));
}

export function getPresignedMultipartUrl(key: string, uploadId: string, partNumber: number): Promise<string> {
  return run((s) => s.presignPart(key, uploadId, partNumber));
}

export function completeMultipartUpload(key: string, uploadId: string, parts: CompletedPart[]): Promise<void> {
  return run((s) => s.completeMultipart(key, uploadId, parts));
}

export function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  return run((s) => s.abortMultipart(key, uploadId));
}

/** Size and type of an object, or null when it doesn't exist. */
export function headObject(key: string): Promise<ObjectInfo | null> {
  return run((s) => s.head(key));
}

export function getPresignedGetUrl(key: string, ttlSeconds = 900): Promise<string> {
  return run((s) => s.presignGet(key, ttlSeconds));
}

export function deleteObject(key: string): Promise<void> {
  return run((s) => s.deleteObject(key));
}

export function listObjects(prefix: string): Promise<ListedObject[]> {
  return run((s) => s.list(prefix));
}

export function getBucketUsage(): Promise<BucketUsage> {
  return run((s) => s.usage());
}
