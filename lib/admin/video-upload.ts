"use client";

import { upload } from "@vercel/blob/client";

/**
 * Client-side media helpers for the admin: direct-to-Vercel-Blob uploads with
 * real progress (the file never passes through our server — the route only
 * mints a short-lived client token), plus local frame capture for automatic
 * thumbnails.
 */

export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
/** No upload progress for this long → abort with a clear error instead of hanging. */
const STALL_MS = 90_000;
const HANDLE_UPLOAD_URL = "/api/admin/blob-upload";

type Progress = (pct: number) => void;
type UploadOpts = { key: string; signal?: AbortSignal };

/** Throws a user-facing message if the file can't be uploaded as a video. */
export function assertUploadable(file: File): void {
  if (!file.type.startsWith("video/")) throw new Error(`"${file.name}" isn't a video file`);
  if (file.size > MAX_VIDEO_BYTES) {
    const gb = (file.size / 1024 ** 3).toFixed(1);
    throw new Error(`"${file.name}" is ${gb}GB — the limit is 2GB`);
  }
}

export function assertImage(file: File): void {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error(`"${file.name}" must be a JPEG, PNG or WebP image`);
}

function extension(name: string, fallback: string): string {
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() : "";
  return ext && /^[a-z0-9]{2,5}$/.test(ext) ? ext : fallback;
}

/** crypto.randomUUID only exists in secure contexts (https / localhost) — not on a LAN IP over http. */
function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function uploadVideo(
  file: File,
  onProgress: Progress,
  { key, signal }: UploadOpts,
): Promise<{ videoUrl: string; duration: number }> {
  assertUploadable(file);
  const pathname = `videos/${Date.now()}-${uid()}.${extension(file.name, "mp4")}`;

  // Watchdog: abort if no progress arrives for STALL_MS. (Reset on every
  // progress event, so a large upload that is moving is never cut off.)
  const ctrl = new AbortController();
  let stalled = false;
  let watchdog = 0;
  const arm = () => {
    window.clearTimeout(watchdog);
    watchdog = window.setTimeout(() => {
      stalled = true;
      ctrl.abort();
    }, STALL_MS);
  };
  const onCallerAbort = () => ctrl.abort();
  if (signal?.aborted) ctrl.abort();
  signal?.addEventListener("abort", onCallerAbort, { once: true });
  arm();

  // The SDK doesn't pass the signal to its token request, so also race the
  // abort ourselves — the promise must settle even if a request never returns.
  const aborted = new Promise<never>((_, reject) => {
    ctrl.signal.addEventListener("abort", () =>
      reject(stalled ? new Error(`No upload progress for ${STALL_MS / 1000}s — check your connection and retry`) : new DOMException("Upload cancelled", "AbortError")),
    );
  });

  try {
    // Started first; the duration probe runs alongside and never blocks it.
    const uploading = upload(pathname, file, {
      access: "public",
      handleUploadUrl: HANDLE_UPLOAD_URL,
      headers: { Authorization: `Bearer ${key}` },
      contentType: file.type,
      multipart: true,
      abortSignal: ctrl.signal,
      onUploadProgress: ({ percentage }) => {
        arm();
        onProgress(Math.round(percentage));
      },
    });
    const duration = getVideoDuration(file);
    const blob = await Promise.race([uploading, aborted]);
    return { videoUrl: blob.url, duration: await duration };
  } catch (err) {
    console.error("[upload] upload() failed", err);
    throw err;
  } finally {
    window.clearTimeout(watchdog);
    signal?.removeEventListener("abort", onCallerAbort);
  }
}

export async function uploadImage(
  file: Blob,
  onProgress: Progress,
  { key, signal, name = "thumb.jpg" }: UploadOpts & { name?: string },
): Promise<{ url: string }> {
  const pathname = `thumbnails/${Date.now()}-${uid()}.${extension(name, "jpg")}`;
  const blob = await upload(pathname, file, {
    access: "public",
    handleUploadUrl: HANDLE_UPLOAD_URL,
    headers: { Authorization: `Bearer ${key}` },
    contentType: file.type || "image/jpeg",
    abortSignal: signal,
    onUploadProgress: ({ percentage }) => onProgress(Math.round(percentage)),
  });
  return { url: blob.url };
}

/**
 * Reads the length from metadata. Some files (e.g. HEVC .mov in Chrome) never
 * fire loadedmetadata *or* error, so this gives up after a few seconds —
 * otherwise uploadVideo() would wait on it forever after the upload hits 100%.
 */
export function getVideoDuration(file: File, timeoutMs = 8000): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const src = URL.createObjectURL(file);
    let settled = false;
    const done = (value: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(src);
      video.removeAttribute("src");
      resolve(Number.isFinite(value) ? value : 0);
    };
    const timer = window.setTimeout(() => done(0), timeoutMs);
    video.preload = "metadata";
    video.onloadedmetadata = () => done(video.duration);
    video.onerror = () => done(0);
    video.src = src;
  });
}

/**
 * Grabs one frame as a JPEG. `source` is a local File or a remote URL (remote
 * URLs must send CORS headers — Vercel Blob and Cloudinary both do). The seek
 * is clamped so a clip shorter than `at` still yields its middle frame.
 */
export function captureFrame(source: File | string, at = 1, maxEdge = 1280): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const local = typeof source !== "string";
    const src = local ? URL.createObjectURL(source) : source;
    const cleanup = () => {
      if (local) URL.revokeObjectURL(src);
      video.removeAttribute("src");
      video.load();
    };
    const fail = (msg: string) => {
      cleanup();
      reject(new Error(msg));
    };

    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    if (!local) video.crossOrigin = "anonymous";

    video.onloadedmetadata = () => {
      const t = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(at, video.duration / 2) : 0;
      video.currentTime = t;
    };
    video.onseeked = () => {
      const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
      const w = Math.max(1, Math.round(video.videoWidth * scale));
      const h = Math.max(1, Math.round(video.videoHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return fail("Canvas isn't available in this browser");
      ctx.drawImage(video, 0, 0, w, h);
      try {
        canvas.toBlob(
          (blob) => {
            cleanup();
            if (blob) resolve(blob);
            else reject(new Error("Couldn't encode the frame"));
          },
          "image/jpeg",
          0.85,
        );
      } catch {
        // A tainted canvas (remote video without CORS) throws here.
        fail("This video's host doesn't allow frame capture (CORS)");
      }
    };
    video.onerror = () => fail("Couldn't read that video to capture a frame");
    video.src = src;
  });
}

/** Seconds → "MM:SS" or "HH:MM:SS". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
