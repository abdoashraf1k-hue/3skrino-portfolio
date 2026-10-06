"use client";

import { adminFetch } from "@/lib/admin/client-api";
import { xhrPut } from "@/lib/admin/multipart";
import {
  ALLOWED_TYPES,
  LIMITS,
  type MultipartCompleteResponse,
  type MultipartPartResponse,
  type MultipartStartResponse,
  type PutResponse,
  type UploadRequest,
} from "@/lib/admin/storage/contract";

/**
 * Sprint 12 — move ONE legacy Vercel Blob video into the S3-compatible store
 * (Backblaze B2) entirely in the browser: the bytes stream from the Blob CDN
 * straight into presigned part PUTs, so no server function ever touches them
 * and the tab never holds the whole file — at most a few parts at a time.
 */

/** Parts in flight at once while migrating (downloads compete for bandwidth too). */
const CONCURRENCY = 3;
/** Without a Content-Length we must buffer the whole file to learn its size — only below this. */
const MAX_UNSIZED_BYTES = 512 * 1024 * 1024;
/** Re-sign a part URL this long before it would expire. */
const URL_MARGIN_MS = 60_000;

export type MigrateOptions = {
  adminKey: string;
  /** 0–1: bytes uploaded / size. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

export type MigrateResult = { publicUrl: string; size: number };

const abortError = () => new DOMException("Migration cancelled", "AbortError");

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(t);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

const isAbort = (err: unknown) => err instanceof DOMException && err.name === "AbortError";

/** Try `fn` up to LIMITS.partAttempts times, exponential backoff with jitter. Aborts are never retried. */
async function withRetry<T>(fn: (attempt: number) => Promise<T>, signal?: AbortSignal): Promise<T> {
  let last: unknown = null;
  for (let attempt = 0; attempt < LIMITS.partAttempts; attempt++) {
    throwIfAborted(signal);
    try {
      return await fn(attempt);
    } catch (err) {
      if (isAbort(err) || signal?.aborted) throw err;
      last = err;
      if (attempt < LIMITS.partAttempts - 1) await sleep(600 * 2 ** attempt + Math.random() * 400, signal);
    }
  }
  throw last instanceof Error ? last : new Error("Upload failed");
}

/** "…/videos/1712-abc.mov?x" → "1712-abc.mov" */
function filenameOf(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : "video.mp4";
  } catch {
    return "video.mp4";
  }
}

/** The response's type if the bucket accepts it, else a guess from the extension, else video/mp4. */
function contentTypeOf(res: Response, filename: string): string {
  const header = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const allowed = ALLOWED_TYPES.videos;
  if (allowed.includes(header)) return header;
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "webm") return "video/webm";
  if (ext === "mov") return "video/quicktime";
  return "video/mp4";
}

/** Reads a whole body into a Blob, refusing to grow past `cap`. */
async function readCapped(body: ReadableStream<Uint8Array>, cap: number, signal?: AbortSignal): Promise<Blob> {
  const reader = body.getReader();
  const chunks: BlobPart[] = [];
  let total = 0;
  try {
    for (;;) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > cap) throw new Error("The original has no Content-Length and is over 512 MB — download it and re-upload it from the project editor instead");
      chunks.push(value.slice());
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks);
}

/**
 * Streams `blobUrl` into the bucket. Resolves with the new public URL; the
 * original is left untouched (deleting it is a separate, confirmed step).
 */
export async function migrateVideo(blobUrl: string, { adminKey, onProgress, signal }: MigrateOptions): Promise<MigrateResult> {
  throwIfAborted(signal);
  const api = <T>(req: UploadRequest) => adminFetch<T>(adminKey, "b2-upload", "POST", req);

  const res = await fetch(blobUrl, { signal, cache: "no-store" });
  if (!res.ok || !res.body) throw new Error(`Couldn't download the original (${res.status})`);
  const filename = filenameOf(blobUrl);
  const contentType = contentTypeOf(res, filename);

  // Size: Content-Length when present; otherwise buffer (bounded) to learn it.
  const header = Number(res.headers.get("content-length"));
  let size: number;
  let body: ReadableStream<Uint8Array>;
  if (Number.isFinite(header) && header > 0) {
    size = header;
    body = res.body;
  } else {
    const whole = await readCapped(res.body, MAX_UNSIZED_BYTES, signal);
    size = whole.size;
    body = whole.stream();
  }
  if (size <= 0) throw new Error("The original is empty");
  if (size > LIMITS.maxVideoBytes) throw new Error(`The original is ${(size / 1024 ** 3).toFixed(1)} GB — over the 2 GB limit`);

  const report = (done: number) => onProgress?.(Math.min(1, done / size));
  report(0);

  // Small files: one presigned PUT (multipart parts must be ≥ 5 MiB).
  if (size < LIMITS.multipartThreshold) {
    const whole = await readCapped(body, LIMITS.multipartThreshold, signal);
    const putSignal = signal ?? new AbortController().signal;
    // Signed per attempt: a retry after a 403 (expired / rejected URL) needs a fresh URL.
    const put = await withRetry(async () => {
      const signed = await api<PutResponse>({ action: "put", folder: "videos", filename, contentType, size: whole.size });
      await xhrPut(signed.url, whole, { headers: signed.headers, signal: putSignal, onProgress: report });
      return signed;
    }, signal);
    report(size);
    return { publicUrl: put.publicUrl, size: whole.size };
  }

  const start = await api<MultipartStartResponse>({ action: "multipart-start", folder: "videos", filename, contentType, size });
  const { key, uploadId, partSize, partCount } = start;

  // Part URL cache — minted in batches, re-minted when close to expiry or after a failed PUT.
  const urls = new Map<number, { url: string; expires: number }>();
  const remember = (minted: Record<number, string>, expiresIn: number) => {
    const expires = Date.now() + expiresIn * 1000 - URL_MARGIN_MS;
    for (const [n, url] of Object.entries(minted)) urls.set(Number(n), { url, expires });
  };
  remember(start.urls, start.expiresIn);
  const urlFor = async (n: number): Promise<string> => {
    const hit = urls.get(n);
    if (hit && hit.expires > Date.now()) return hit.url;
    const partNumbers: number[] = [];
    for (let p = n; p <= partCount && partNumbers.length < LIMITS.signBatch; p++) partNumbers.push(p);
    const r = await api<MultipartPartResponse>({ action: "multipart-part", key, uploadId, partNumbers });
    remember(r.urls, r.expiresIn);
    const url = urls.get(n)?.url;
    if (!url) throw new Error(`No upload URL for part ${n}`);
    return url;
  };

  // Progress: bytes of finished parts + live bytes of parts in flight.
  let finishedBytes = 0;
  const live = new Map<number, number>();
  const tick = () => {
    let sum = finishedBytes;
    for (const v of live.values()) sum += v;
    report(sum);
  };

  // Our own controller so one failed part stops the rest.
  const ctrl = new AbortController();
  const onCallerAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onCallerAbort, { once: true });

  const parts: { partNumber: number; etag: string }[] = [];
  const inFlight = new Set<Promise<void>>();
  let failure: unknown = null;

  const sendPart = (partNumber: number, data: Blob) => {
    const p = withRetry(async (attempt) => {
      if (attempt > 0) urls.delete(partNumber); // a fresh signature after a failure
      live.set(partNumber, 0);
      const url = await urlFor(partNumber);
      const { etag } = await xhrPut(url, data, {
        signal: ctrl.signal,
        onProgress: (loaded) => {
          live.set(partNumber, loaded);
          tick();
        },
      });
      if (!etag) throw new Error("The bucket's CORS rules must expose the ETag header (see docs/STORAGE.md)");
      return etag;
    }, ctrl.signal)
      .then((etag) => {
        live.delete(partNumber);
        finishedBytes += data.size;
        parts.push({ partNumber, etag });
        tick();
      })
      .catch((err: unknown) => {
        live.delete(partNumber);
        if (failure === null) failure = err;
        ctrl.abort();
      })
      .finally(() => {
        inFlight.delete(p);
      });
    inFlight.add(p);
  };

  const reader = body.getReader();
  try {
    let pending: Uint8Array[] = [];
    let pendingBytes = 0;
    let partNumber = 0;
    let read = 0;

    const flush = async () => {
      if (!pendingBytes) return;
      partNumber++;
      if (partNumber > partCount) throw new Error("The original is larger than its Content-Length");
      const data = new Blob(pending as BlobPart[], { type: contentType });
      pending = [];
      pendingBytes = 0;
      while (inFlight.size >= CONCURRENCY) await Promise.race(inFlight);
      if (failure !== null || ctrl.signal.aborted) return;
      sendPart(partNumber, data);
    };

    for (;;) {
      if (failure !== null) break;
      throwIfAborted(ctrl.signal);
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
      let offset = 0;
      while (offset < value.byteLength) {
        const take = Math.min(partSize - pendingBytes, value.byteLength - offset);
        // Copy: the reader may reuse its buffer.
        pending.push(value.slice(offset, offset + take));
        pendingBytes += take;
        offset += take;
        if (pendingBytes === partSize) await flush();
      }
    }
    if (failure === null) {
      throwIfAborted(ctrl.signal);
      await flush();
    }
    while (inFlight.size) await Promise.race(inFlight);
    if (failure !== null) throw failure;
    throwIfAborted(signal);
    if (read !== size) throw new Error(`Downloaded ${read} of ${size} bytes — the original changed or the connection dropped`);
    if (parts.length !== partCount) throw new Error(`Uploaded ${parts.length} of ${partCount} parts`);

    parts.sort((a, b) => a.partNumber - b.partNumber);
    const done = await api<MultipartCompleteResponse>({ action: "multipart-complete", key, uploadId, parts });
    report(size);
    return { publicUrl: done.publicUrl || start.publicUrl, size: done.size || size };
  } catch (err) {
    ctrl.abort();
    void reader.cancel().catch(() => undefined);
    // Let in-flight PUTs settle, then drop the half-made object (best effort).
    await Promise.allSettled([...inFlight]);
    void api({ action: "multipart-abort", key, uploadId }).catch(() => undefined);
    const real: unknown = failure ?? err;
    throw signal?.aborted || isAbort(real) ? abortError() : real;
  } finally {
    signal?.removeEventListener("abort", onCallerAbort);
    try {
      reader.releaseLock();
    } catch {
      // already released / cancelled
    }
  }
}
