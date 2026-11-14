import "server-only";
import { tigrisConfig } from "@/lib/storage/tigris";
import { b2Config } from "./b2";
import { createS3Store, type S3Config } from "./s3";
import { StorageError, type BucketUsage, type CompletedPart, type ListedObject, type ObjectInfo, type ObjectStore } from "./types";

/**
 * Sprint 15.5 — the site's ONE media bucket, whichever host it lives on.
 *
 * Tigris wins when TIGRIS_* is set; otherwise Backblaze B2 (B2_*), as before.
 * Every admin upload route, the /media delivery route and the storage panel
 * go through here, so switching hosts is an env change. Stored URLs are
 * <site>/media/<key> — host-agnostic — so nothing in data/ changes when the
 * bucket moves, as long as the objects were copied across
 * (scripts/migrate-b2-to-tigris.mjs).
 *
 * The project data still calls this provider "b2" (VideoProvider): that id
 * now means "the S3 bucket", whichever host it is.
 */

export type BucketHost = "tigris" | "b2";

export const HOST_LABEL: Record<BucketHost, string> = { tigris: "Tigris", b2: "Backblaze B2" };

/** Which host is active and its config, or null when neither is configured. */
export function activeBucket(): { host: BucketHost; config: S3Config } | null {
  const t = tigrisConfig();
  if (t) return { host: "tigris", config: t };
  const b = b2Config();
  if (b) return { host: "b2", config: b };
  return null;
}

export function isBucketConfigured(): boolean {
  return activeBucket() !== null;
}

function store(): { host: BucketHost; store: ObjectStore } {
  const active = activeBucket();
  if (!active) {
    throw new StorageError(
      "No media bucket is configured — set TIGRIS_ACCESS_KEY_ID, TIGRIS_SECRET_ACCESS_KEY and TIGRIS_BUCKET_NAME (or the legacy B2_* variables)",
      503,
    );
  }
  return { host: active.host, store: createS3Store(active.config) };
}

const CREDENTIAL_ERRORS = new Set(["AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch", "Forbidden", "Unauthorized"]);
const NETWORK_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "EPIPE"]);

/** SDK / network failure → StorageError with a readable message naming the host. Never includes credentials. */
export function toStorageError(err: unknown, host: BucketHost): StorageError {
  const name = HOST_LABEL[host];
  const vars = host === "tigris" ? "TIGRIS_ACCESS_KEY_ID / TIGRIS_SECRET_ACCESS_KEY" : "B2_KEY_ID / B2_APP_KEY";
  if (err instanceof StorageError) return err;
  if (!(err instanceof Error)) return new StorageError(`${name} request failed`, 502);
  const code = (err as { code?: unknown }).code;
  const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;

  if (err.name === "NoSuchUpload") return new StorageError("That upload expired or was already finished", 404);
  if (err.name === "NoSuchKey" || err.name === "NotFound") return new StorageError("That file isn't in the bucket", 404);
  if (err.name === "NoSuchBucket") return new StorageError(`${name} bucket not found — check the bucket name`, 502);
  if (/cap exceeded/i.test(err.message)) return new StorageError(`${name} daily cap exceeded — downloads are blocked until it resets`, 503);
  if (CREDENTIAL_ERRORS.has(err.name) || status === 401 || status === 403) {
    return new StorageError(`${name} rejected the credentials — check ${vars}`, 502);
  }
  if (err.name === "InvalidPart" || err.name === "InvalidPartOrder" || err.name === "EntityTooSmall") {
    return new StorageError(`${name} couldn't assemble the upload (${err.name}) — retry the upload`, 400);
  }
  if (err.name === "TimeoutError" || (typeof code === "string" && NETWORK_CODES.has(code))) {
    return new StorageError(`Couldn't reach ${name} — check the endpoint or retry`, 502);
  }
  if (status === 503 || err.name === "SlowDown" || err.name === "ServiceUnavailable") {
    return new StorageError(`${name} is busy right now — retry in a moment`, 503);
  }
  return new StorageError(`${name} request failed (${status ? `HTTP ${status}` : err.name}) — retry, or check the storage settings`, 502);
}

/** Runs one store call against the active bucket, mapping any failure. */
async function run<T>(fn: (s: ObjectStore) => Promise<T>): Promise<T> {
  const { host, store: s } = store();
  try {
    return await fn(s);
  } catch (err) {
    throw toStorageError(err, host);
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
