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

const NETWORK_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "EPIPE"]);

/**
 * Everything the AWS SDK knows about a failure — never credentials. Note:
 * HEAD requests (HeadBucket, HeadObject) have no response body, so a 403 on
 * them arrives as name "Unknown" / "UnknownError" with only the status: the
 * real code (InvalidAccessKeyId, SignatureDoesNotMatch, AccessDenied…) needs a
 * request that returns a body, e.g. ListObjectsV2 (see conntest.ts).
 */
export type S3ErrorInfo = { name: string; code: string; status: number | null; message: string; requestId: string };

export function describeS3Error(err: unknown): S3ErrorInfo {
  if (!(err instanceof Error)) return { name: "Error", code: "", status: null, message: String(err), requestId: "" };
  const e = err as Error & { Code?: string; code?: string; $metadata?: { httpStatusCode?: number; requestId?: string; extendedRequestId?: string } };
  return {
    name: e.name,
    code: e.Code ?? (typeof e.code === "string" ? e.code : "") ?? "",
    status: e.$metadata?.httpStatusCode ?? null,
    message: e.message,
    requestId: e.$metadata?.requestId ?? e.$metadata?.extendedRequestId ?? "",
  };
}

/** One line for logs: the SDK's own words, so the real cause is visible (Vercel → Logs). */
export function logS3Error(context: string, err: unknown): void {
  const d = describeS3Error(err);
  console.error(
    `[storage] ${context} failed: ${d.code || d.name}${d.status ? ` (HTTP ${d.status})` : ""} — ${d.message}${d.requestId ? ` · request ${d.requestId}` : ""}`,
  );
}

/** SDK / network failure → StorageError with a readable message naming the host. Never includes credentials. */
export function toStorageError(err: unknown, host: BucketHost): StorageError {
  const name = HOST_LABEL[host];
  const idVar = host === "tigris" ? "TIGRIS_ACCESS_KEY_ID" : "B2_KEY_ID";
  const secretVar = host === "tigris" ? "TIGRIS_SECRET_ACCESS_KEY" : "B2_APP_KEY";
  if (err instanceof StorageError) return err;
  if (!(err instanceof Error)) return new StorageError(`${name} request failed`, 502);
  const { code: errCode, status } = describeS3Error(err);
  const code = (err as { code?: unknown }).code;
  const kind = errCode || err.name;

  if (err.name === "NoSuchUpload") return new StorageError("That upload expired or was already finished", 404);
  if (err.name === "NoSuchKey" || err.name === "NotFound") return new StorageError("That file isn't in the bucket", 404);
  if (kind === "NoSuchBucket") return new StorageError(`${name} bucket not found — check the bucket name (exact, lowercase)`, 502);
  if (/cap exceeded/i.test(err.message)) return new StorageError(`${name} daily cap exceeded — downloads are blocked until it resets`, 503);
  // The real cause, when the response carried one.
  if (kind === "InvalidAccessKeyId") return new StorageError(`${name} doesn't recognise this access key ID — check ${idVar} (a deleted key, a typo, or a key from another account)`, 502);
  if (kind === "SignatureDoesNotMatch") return new StorageError(`${name} knows the key ID but the secret doesn't match — check ${secretVar} (no spaces / line breaks; it's shown only once when the key is created)`, 502);
  if (kind === "AccessDenied") return new StorageError(`${name} accepted the key but it has no permission on this bucket — give it ReadWrite (or Editor) on the bucket`, 502);
  if (kind === "RequestTimeTooSkewed") return new StorageError(`${name} refused the request: the server clock is off by more than 15 minutes`, 502);
  if (status === 401 || status === 403 || err.name === "Forbidden" || err.name === "Unauthorized") {
    // A bare 403 (e.g. from a HEAD request, which has no body): the cause isn't known here.
    return new StorageError(`${name} answered 403 Forbidden — run admin → Settings → Storage → Test connection for the exact reason`, 502);
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
    // Not-found answers are routine (HeadObject before an upload, deleted media) — log only real failures.
    if (describeS3Error(err).status !== 404) logS3Error(`${HOST_LABEL[host]} request`, err);
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
