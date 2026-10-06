import {
  LIMITS,
  type MediaFolder,
  type MultipartCompleteResponse,
  type MultipartPartResponse,
  type MultipartStartResponse,
  type OkResponse,
  type PutResponse,
  type UploadRequest,
} from "./storage/contract";

/**
 * Sprint 12 — browser → S3-compatible bucket (B2) uploads through presigned
 * URLs minted by POST /api/admin/b2-upload. Pure module: no React, no DOM at
 * import time. The HTTP calls are injected (`api`, `put`), so the whole state
 * machine runs in Node under a fake transport (scripts/test-multipart.mts).
 *
 *   < 5 MiB  → "put" → one PUT (thumbnails always: they're capped at 15 MiB)
 *   ≥ 5 MiB  → "multipart-start" → N parallel part PUTs (re-signed in batches,
 *              retried with backoff) → "multipart-complete"
 *   failure  → in-flight PUTs aborted → "multipart-abort" (best effort)
 */

/** One PUT of `body` to a presigned URL. Rejects with an Error carrying `.status` (0 = network) for non-2xx. */
export type PutTransport = (
  url: string,
  body: Blob,
  opts: { headers?: Record<string, string>; signal: AbortSignal; onProgress: (loaded: number) => void },
) => Promise<{ status: number; etag: string | null }>;

/** POST /api/admin/b2-upload. Throws an Error (with `.status` when known) on HTTP errors. */
export type Api = <T>(body: UploadRequest) => Promise<T>;

export type StoreUploadOpts = {
  folder: MediaFolder;
  api: Api;
  put: PutTransport;
  /** Integer 0–100, only on change, at most every 100 ms, always ending with 100. */
  onProgress?: (pct: number) => void;
  /** Every raw byte-progress event (unthrottled) — for stall watchdogs. */
  onActivity?: () => void;
  /** Called once the server has accepted the upload (put signed / multipart started). */
  onStarted?: () => void;
  signal?: AbortSignal;
  concurrency?: number;
  attempts?: number;
  backoffMs?: (attempt: number) => number;
  /** Overrides `file.name` (a Blob from a canvas has none). */
  filename?: string;
};

export type StoreUploadResult = { publicUrl: string; key: string; size: number };

type HttpError = Error & { status?: number };

const ETAG_MESSAGE = "The bucket's CORS rules must expose the ETag header (see docs/STORAGE.md)";
/** Refresh a presigned URL this long before it expires. */
const REFRESH_MARGIN_S = 120;
const PROGRESS_INTERVAL_MS = 100;

class FatalUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FatalUploadError";
  }
}

function httpError(message: string, status: number): HttpError {
  const err: HttpError = new Error(message);
  err.status = status;
  return err;
}

function statusOf(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "status" in err && typeof err.status === "number") return err.status;
  return undefined;
}

/** Network errors (no status), 5xx, 429 and 408 are worth another try; 403 means "re-sign". */
function retriable(err: unknown): boolean {
  if (err instanceof FatalUploadError) return false;
  if (err instanceof Error && err.name === "AuthError") return false; // admin key rejected — retrying won't help
  const status = statusOf(err);
  return status === undefined || status === 0 || status >= 500 || status === 429 || status === 408 || status === 403;
}

/** Exponential backoff with ±50% jitter: ~0.5s, 1s, 2s … capped at 8s. */
function defaultBackoff(attempt: number): number {
  return Math.min(8000, 500 * 2 ** (attempt - 1)) * (0.5 + Math.random());
}

const abortError = () => new DOMException("Upload cancelled", "AbortError");

/** setTimeout that resolves early (and cleans up) when `signal` aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

export async function uploadToStore(
  file: Blob & { name?: string; type: string },
  {
    folder,
    api,
    put,
    onProgress,
    onActivity,
    onStarted,
    signal,
    concurrency = LIMITS.concurrency,
    attempts = LIMITS.partAttempts,
    backoffMs = defaultBackoff,
    filename,
  }: StoreUploadOpts,
): Promise<StoreUploadResult> {
  const size = file.size;
  const info = { filename: filename ?? file.name ?? "upload", contentType: file.type, size };

  // One controller for the whole upload: the caller's signal and any fatal
  // error both trip it, and every in-flight PUT hangs off it via a child.
  const ctrl = new AbortController();
  let userAborted = false;
  const onCallerAbort = () => {
    userAborted = true;
    ctrl.abort();
  };
  if (signal?.aborted) onCallerAbort();
  signal?.addEventListener("abort", onCallerAbort, { once: true });

  // API calls take no signal, so race them against the abort.
  let rejectAborted: (err: unknown) => void = () => {};
  const aborted = new Promise<never>((_, reject) => (rejectAborted = reject));
  aborted.catch(() => {});
  const onAbort = () => rejectAborted(abortError());
  ctrl.signal.addEventListener("abort", onAbort, { once: true });
  const race = <T>(p: Promise<T>): Promise<T> => (ctrl.signal.aborted ? Promise.reject(abortError()) : Promise.race([p, aborted]));

  // Aggregate progress: Σ loaded bytes per part / size, monotonic, throttled.
  const loaded = new Map<number, number>();
  let lastPct = -1;
  let lastEmit = 0;
  const report = (final = false) => {
    if (!onProgress) return;
    let sum = 0;
    for (const v of loaded.values()) sum += v;
    const pct = final ? 100 : Math.min(99, size > 0 ? Math.floor((sum / size) * 100) : 0);
    const now = Date.now();
    if (pct <= lastPct) return;
    if (!final && now - lastEmit < PROGRESS_INTERVAL_MS) return;
    lastPct = pct;
    lastEmit = now;
    onProgress(pct);
  };
  const setLoaded = (part: number, bytes: number) => {
    loaded.set(part, bytes);
    onActivity?.();
    report();
  };

  /** One PUT under a child controller (so a single part can be cancelled with the rest). */
  const putOnce = async (part: number, url: string, body: Blob, headers?: Record<string, string>) => {
    const child = new AbortController();
    const forward = () => child.abort();
    ctrl.signal.addEventListener("abort", forward, { once: true });
    try {
      const res = await put(url, body, { headers, signal: child.signal, onProgress: (bytes) => setLoaded(part, bytes) });
      if (res.status < 200 || res.status >= 300) throw httpError(`Upload failed (${res.status})`, res.status);
      return res;
    } finally {
      ctrl.signal.removeEventListener("abort", forward);
    }
  };

  /** Retries `run` per the attempt budget; `onForbidden` runs before a 403 retry (re-sign). */
  const withRetry = async <T>(part: number, run: () => Promise<T>, onForbidden: () => void): Promise<T> => {
    for (let attempt = 1; ; attempt++) {
      if (ctrl.signal.aborted) throw abortError();
      loaded.set(part, 0);
      try {
        return await run();
      } catch (err) {
        if (ctrl.signal.aborted) throw abortError();
        loaded.set(part, 0);
        if (!retriable(err) || attempt >= attempts) throw err;
        if (statusOf(err) === 403) onForbidden();
        else await sleep(backoffMs(attempt), ctrl.signal);
      }
    }
  };

  try {
    if (ctrl.signal.aborted) throw abortError();

    /* ---------------- small file / any image: one presigned PUT ---------------- */
    if (size < LIMITS.multipartThreshold || folder !== "videos") {
      let signed: PutResponse | null = null;
      await withRetry(
        1,
        async () => {
          signed ??= await race(api<PutResponse>({ action: "put", folder, ...info }));
          onStarted?.();
          return putOnce(1, signed.url, file, signed.headers);
        },
        () => (signed = null),
      );
      const done = signed as PutResponse | null;
      if (!done) throw new Error("Upload failed");
      report(true);
      return { publicUrl: done.publicUrl, key: done.key, size };
    }

    /* ---------------- large video: multipart ---------------- */
    const starting = api<MultipartStartResponse>({ action: "multipart-start", folder, ...info });
    let start: MultipartStartResponse;
    try {
      start = await race(starting);
    } catch (err) {
      // Cancelled while the server was creating the upload — clean it up when it lands.
      if (ctrl.signal.aborted) {
        starting
          .then((s) => api<OkResponse>({ action: "multipart-abort", key: s.key, uploadId: s.uploadId }))
          .catch(() => {});
      }
      throw err;
    }
    onStarted?.();
    const { key, uploadId, partSize, partCount, publicUrl } = start;

    try {
      // Presigned part URLs, with the time they were minted.
      const urls = new Map<number, { url: string; expiresAt: number }>();
      const store = (batch: Record<number, string>, expiresIn: number) => {
        const expiresAt = Date.now() + (expiresIn - REFRESH_MARGIN_S) * 1000;
        for (const [n, url] of Object.entries(batch)) urls.set(Number(n), { url, expiresAt });
      };
      store(start.urls, start.expiresIn);

      // One in-flight multipart-part request per batch; concurrent askers share it.
      const signing = new Map<number, Promise<void>>();
      const signBatch = (batch: number): Promise<void> => {
        const pending = signing.get(batch);
        if (pending) return pending;
        const first = batch * LIMITS.signBatch + 1;
        const partNumbers: number[] = [];
        for (let n = first; n < first + LIMITS.signBatch && n <= partCount; n++) partNumbers.push(n);
        const req = race(api<MultipartPartResponse>({ action: "multipart-part", key, uploadId, partNumbers }))
          .then((res) => store(res.urls, res.expiresIn))
          .finally(() => signing.delete(batch));
        signing.set(batch, req);
        return req;
      };
      const urlFor = async (n: number): Promise<string> => {
        for (let tries = 0; tries < 2; tries++) {
          const hit = urls.get(n);
          if (hit && hit.expiresAt > Date.now()) return hit.url;
          await signBatch(Math.floor((n - 1) / LIMITS.signBatch));
        }
        const hit = urls.get(n);
        if (!hit) throw new Error(`The server didn't sign part ${n}`);
        return hit.url;
      };

      const parts: { partNumber: number; etag: string }[] = [];
      let next = 1;
      let failure: unknown = null;

      const uploadPart = (n: number) =>
        withRetry(
          n,
          async () => {
            const url = await urlFor(n);
            // Lazy slice: no copy of a 2 GB file, just a view.
            const body = file.slice((n - 1) * partSize, Math.min(n * partSize, size));
            const res = await putOnce(n, url, body);
            if (!res.etag) throw new FatalUploadError(ETAG_MESSAGE);
            return res.etag;
          },
          () => urls.delete(n),
        );

      const worker = async () => {
        while (!ctrl.signal.aborted && next <= partCount) {
          const n = next++;
          const etag = await uploadPart(n);
          loaded.set(n, Math.min(n * partSize, size) - (n - 1) * partSize);
          report();
          parts.push({ partNumber: n, etag });
        }
      };

      const lanes = Math.max(1, Math.min(concurrency, partCount));
      await Promise.all(
        Array.from({ length: lanes }, () =>
          worker().catch((err: unknown) => {
            failure ??= err;
            ctrl.abort(); // stop the other workers and their in-flight PUTs
          }),
        ),
      );
      if (userAborted) throw abortError();
      if (failure) throw failure;

      parts.sort((a, b) => a.partNumber - b.partNumber);
      // No byte progress while the bucket assembles the parts — tell the stall watchdog we're alive.
      onActivity?.();
      // Retried like a part: one blip here would otherwise throw away the whole upload.
      // The route treats an already-completed upload as success, so a retry is safe.
      const done = await withRetry(
        0,
        () => race(api<MultipartCompleteResponse>({ action: "multipart-complete", key, uploadId, parts })),
        () => {},
      );
      report(true);
      return { publicUrl: done.publicUrl || publicUrl, key, size: done.size || size };
    } catch (err) {
      ctrl.abort();
      await api<OkResponse>({ action: "multipart-abort", key, uploadId }).catch(() => {});
      throw err;
    }
  } catch (err) {
    if (userAborted) throw abortError();
    throw err;
  } finally {
    signal?.removeEventListener("abort", onCallerAbort);
    ctrl.signal.removeEventListener("abort", onAbort);
  }
}

/** PutTransport over XMLHttpRequest — fetch() has no upload progress. */
export const xhrPut: PutTransport = (url, body, { headers, signal, onProgress }) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const settle = () => signal.removeEventListener("abort", onAbort);

    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers ?? {})) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.DONE || xhr.status === 0) return; // 0 → onerror / onabort
      settle();
      if (xhr.status >= 200 && xhr.status < 300) resolve({ status: xhr.status, etag: xhr.getResponseHeader("ETag") });
      else reject(httpError(`Upload failed (${xhr.status})`, xhr.status));
    };
    xhr.onerror = () => {
      settle();
      reject(httpError("Network error while uploading", 0));
    };
    xhr.ontimeout = xhr.onerror;
    xhr.onabort = () => {
      settle();
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    xhr.send(body);
  });
