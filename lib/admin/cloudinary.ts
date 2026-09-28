/**
 * Client-side Cloudinary helpers: unsigned upload with real progress, and URL
 * builders that bake in auto-optimisation (f_auto → WebM for Chrome, MP4 for
 * Safari; q_auto → "good" quality; c_fill → fill without distortion; so_1 →
 * thumbnails grabbed 1s in, past any fade-from-black).
 *
 * The upload preset is public by design (unsigned); /admin itself is gated.
 */

const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";
const PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "";

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export type UploadResult = { videoUrl: string; thumbnailUrl: string; duration: number };

/** Throws a user-facing message if the file can't be uploaded. */
export function assertUploadable(file: File): void {
  if (!file.type.startsWith("video/")) {
    throw new Error(`"${file.name}" isn't a video file`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(0);
    throw new Error(`"${file.name}" is ${mb}MB — the limit is 100MB`);
  }
}

export function uploadToCloudinary(
  file: File,
  onProgress: (pct: number) => void,
  signal?: AbortSignal,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    try {
      assertUploadable(file);
    } catch (err) {
      reject(err);
      return;
    }
    if (!CLOUD || !PRESET) {
      reject(new Error("Cloudinary isn't configured (NEXT_PUBLIC_CLOUDINARY_* env vars)"));
      return;
    }

    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD}/video/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    xhr.onload = () => {
      let body: { secure_url?: unknown; public_id?: unknown; duration?: unknown; error?: { message?: unknown } } = {};
      try {
        body = JSON.parse(xhr.responseText) as typeof body;
      } catch {
        // handled below
      }
      if (xhr.status < 200 || xhr.status >= 300 || typeof body.secure_url !== "string" || typeof body.public_id !== "string") {
        const msg = typeof body.error?.message === "string" ? body.error.message : `HTTP ${xhr.status}`;
        reject(new Error(`Cloudinary rejected the upload: ${msg}`));
        return;
      }
      onProgress(100);
      resolve({
        videoUrl: body.secure_url,
        thumbnailUrl: thumbnailFor(body.public_id, 800, 450),
        duration: typeof body.duration === "number" ? body.duration : 0,
      });
    };

    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/* ------------------------------------------------------------------ */
/* URL builders                                                        */
/* ------------------------------------------------------------------ */

type Parsed = { cloud: string; publicId: string };

/** Pulls cloud + public_id out of a res.cloudinary.com video URL. */
export function parseVideoUrl(videoUrl: string): Parsed | null {
  const m = /^https:\/\/res\.cloudinary\.com\/([^/]+)\/video\/upload\/(.+)$/.exec(videoUrl.split("?")[0]);
  if (!m) return null;
  let segments = m[2].split("/");
  // Drop any transformation segments up to and including the version (v123…).
  const version = segments.findIndex((s) => /^v\d+$/.test(s));
  if (version !== -1) segments = segments.slice(version + 1);
  const publicId = segments.join("/").replace(/\.[a-z0-9]+$/i, "");
  return publicId ? { cloud: m[1], publicId } : null;
}

function thumbnailFor(publicId: string, w: number, h: number, cloud = CLOUD): string {
  return `https://res.cloudinary.com/${cloud}/video/upload/q_auto,f_auto,w_${w},h_${h},c_fill,so_1/${publicId}.jpg`;
}

/** Still frame (1s in) cropped to fill w×h. Empty string if not a Cloudinary video. */
export function videoThumbnail(videoUrl: string, w: number, h: number): string {
  const parsed = parseVideoUrl(videoUrl);
  return parsed ? thumbnailFor(parsed.publicId, w, h, parsed.cloud) : "";
}

/** The poster stored in `thumbnail` — shaped to the project's orientation. */
export function posterFor(videoUrl: string, orientation: "vertical" | "horizontal"): string {
  return orientation === "vertical" ? videoThumbnail(videoUrl, 450, 800) : videoThumbnail(videoUrl, 800, 450);
}

/**
 * Playback URL with q_auto,f_auto. Cloudinary reads transformations from the
 * path (a `?q_auto,f_auto` query string is ignored), so it's injected after
 * /upload/. Non-Cloudinary URLs pass through unchanged.
 */
export function playerUrl(videoUrl: string): string {
  if (!parseVideoUrl(videoUrl) || videoUrl.includes("/video/upload/q_auto,f_auto/")) return videoUrl;
  return videoUrl.replace("/video/upload/", "/video/upload/q_auto,f_auto/");
}

/** Cloudinary reports seconds as a float → "MM:SS" or "HH:MM:SS". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
