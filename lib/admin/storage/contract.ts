/**
 * Sprint 12 — the storage contract shared by the browser uploader, the admin
 * API routes and the server-side providers. Isomorphic: no Node or browser
 * imports, no secrets. Every module that moves media bytes agrees on these
 * names, limits and request/response shapes.
 *
 *   browser ──(1) POST /api/admin/b2-upload {action}──▶ route (admin key) ──▶ presign (server-only creds)
 *   browser ──(2) PUT bytes directly to the presigned URL ───────────────────▶ S3-compatible bucket (B2…)
 *   visitor ──(3) GET /media/<key> ──▶ 302 to a 15-min presigned GET ─────────▶ bucket (private OK)
 */

/** Where new videos go. "vercel-blob" is the pre-Sprint-12 path, kept intact. */
export type VideoProvider = "b2" | "vercel-blob";
/** admin → Settings → Storage. "auto" = b2 when configured, else Vercel Blob. */
export type ProviderSetting = "auto" | VideoProvider;
export const PROVIDER_SETTINGS: readonly ProviderSetting[] = ["auto", "b2", "vercel-blob"];

/** Folders an S3-compatible bucket accepts uploads into. */
export type MediaFolder = "videos" | "thumbnails";
export const MEDIA_FOLDERS: readonly MediaFolder[] = ["videos", "thumbnails"];

const MiB = 1024 * 1024;

/** Upload limits (S3 multipart: parts 5 MiB–5 GiB, ≤ 10,000 parts). */
export const LIMITS = {
  /** Largest video the admin accepts. */
  maxVideoBytes: 2 * 1024 * MiB,
  /** Largest thumbnail / still. */
  maxImageBytes: 15 * MiB,
  /** Below this a single presigned PUT; at or above it multipart. */
  multipartThreshold: 5 * MiB,
  /** S3 minimum part size (all but the last part). */
  minPartBytes: 5 * MiB,
  /** Browser-friendly default: a 2 GB file → 128 parts. */
  defaultPartBytes: 16 * MiB,
  maxParts: 10_000,
  /** Parts in flight at once. */
  concurrency: 5,
  /** Attempts per part (1 try + 2 retries), exponential backoff with jitter. */
  partAttempts: 3,
  /** Part URLs minted per multipart-part call. */
  signBatch: 8,
  /** Every presigned URL (PUT, part, GET) lives at most this long. */
  presignTtlSeconds: 900,
} as const;

/** Part size for a file: ≥ the default, big enough to stay under maxParts. */
export function partSizeFor(size: number): number {
  return Math.max(LIMITS.defaultPartBytes, Math.ceil(size / (LIMITS.maxParts - 1)));
}

/** Content types the bucket will sign, per folder. */
export const ALLOWED_TYPES: Record<MediaFolder, readonly string[]> = {
  videos: ["video/mp4", "video/webm", "video/quicktime"],
  thumbnails: ["image/jpeg", "image/png", "image/webp"],
};

/**
 * Object keys are minted on the server only: "<folder>/<epoch ms>-<random>.<ext>".
 * Routes re-check every key a browser sends back against this pattern.
 */
export const KEY_PATTERN = /^(videos|thumbnails)\/\d{10,16}-[a-z0-9-]{6,40}\.[a-z0-9]{2,5}$/;

/** Public path of the delivery route (app/media/[...key]/route.ts). */
export const MEDIA_ROUTE = "/media";

/* ------------------------------------------------------------------ */
/* POST /api/admin/b2-upload — request bodies                          */
/* ------------------------------------------------------------------ */

export type FileInfo = { filename: string; contentType: string; size: number };

export type UploadRequest =
  | { action: "config" }
  | ({ action: "put"; folder: MediaFolder } & FileInfo)
  | ({ action: "multipart-start"; folder: "videos" } & FileInfo)
  | { action: "multipart-part"; key: string; uploadId: string; partNumbers: number[] }
  | { action: "multipart-complete"; key: string; uploadId: string; parts: { partNumber: number; etag: string }[] }
  | { action: "multipart-abort"; key: string; uploadId: string }
  /** `url` is a public URL this store produced (…/media/<key> or <CDN>/<key>). */
  | { action: "delete"; url: string };

export type UploadAction = UploadRequest["action"];

/* ------------------------------------------------------------------ */
/* Responses (errors are always { error: string } with a 4xx/5xx)      */
/* ------------------------------------------------------------------ */

export type ConfigResponse = {
  /** Where new videos go right now (after env + admin setting + fallback). */
  provider: VideoProvider;
  setting: ProviderSetting;
  configured: { b2: boolean; blob: boolean };
  /** Base that public URLs start with: the CDN, or <site>/media. */
  publicBase: string;
};

export type PutResponse = {
  key: string;
  /** Presigned PUT URL (≤ 15 min). */
  url: string;
  /** Headers the browser must send with the PUT (they're part of the signature). */
  headers: Record<string, string>;
  publicUrl: string;
  expiresIn: number;
};

export type MultipartStartResponse = {
  key: string;
  uploadId: string;
  partSize: number;
  partCount: number;
  /** The first batch of part URLs, by part number (1-based). */
  urls: Record<number, string>;
  publicUrl: string;
  expiresIn: number;
};

export type MultipartPartResponse = { urls: Record<number, string>; expiresIn: number };
export type MultipartCompleteResponse = { publicUrl: string; size: number };
export type OkResponse = { ok: true };
export type DeleteResponse = { ok: true; deleted: boolean };

/* ------------------------------------------------------------------ */
/* GET /api/admin/storage — the Settings → Storage panel               */
/* ------------------------------------------------------------------ */

export type StoreUsage = { configured: boolean; bytes: number; count: number; videos: number; error?: string };

export type StorageStatusResponse = {
  provider: VideoProvider;
  setting: ProviderSetting;
  b2: StoreUsage & { bucket: string; endpoint: string; publicBase: string };
  blob: StoreUsage & { quotaBytes: number };
};

/* ------------------------------------------------------------------ */
/* Helpers both sides use                                              */
/* ------------------------------------------------------------------ */

/** True for URLs served by the Vercel Blob store (legacy + small assets). */
export const isBlobUrl = (url: string) => /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i.test(url);

/** The key inside a URL this store produced, or null. Works for <base>/media/<key> and <cdn>/<key>. */
export function keyFromPublicUrl(url: string, publicBase: string): string | null {
  const base = publicBase.replace(/\/+$/, "");
  if (!url.startsWith(`${base}/`)) return null;
  let key: string;
  try {
    key = decodeURIComponent(url.slice(base.length + 1).split(/[?#]/)[0]);
  } catch {
    return null; // malformed percent-encoding
  }
  return KEY_PATTERN.test(key) ? key : null;
}
