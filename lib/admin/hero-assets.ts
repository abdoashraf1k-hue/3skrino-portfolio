"use client";

import { upload } from "@vercel/blob/client";

/**
 * Admin helpers for hero assets: direct-to-Vercel-Blob uploads (poses under
 * hero/, logos under brands/) and an in-browser upscaler for low-res poses.
 */

const HANDLE_UPLOAD_URL = "/api/admin/blob-upload";
export const POSE_MAX_EDGE = 1600;

const POSE_TYPES = /^image\/(png|webp)$/;
const LOGO_TYPES = /^image\/(png|webp|jpeg|svg\+xml)$/;

export function assertPoseFile(file: File): void {
  if (!POSE_TYPES.test(file.type)) throw new Error(`"${file.name}" must be a transparent PNG or WebP`);
}

export function assertSiteImage(file: File): void {
  if (!/^image\/(png|webp|jpeg)$/.test(file.type)) throw new Error(`"${file.name}" must be a PNG, JPEG or WebP`);
}

export function assertLogoFile(file: File): void {
  if (!LOGO_TYPES.test(file.type)) throw new Error(`"${file.name}" must be a PNG, SVG, WebP or JPEG`);
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "asset";

function extension(type: string): string {
  if (type === "image/svg+xml") return "svg";
  if (type === "image/jpeg") return "jpg";
  return type.split("/")[1] ?? "png";
}

export async function uploadHeroAsset(
  file: Blob,
  folder: "hero" | "brands" | "site",
  name: string,
  key: string,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const pathname = `${folder}/${slug(name)}-${Date.now().toString(36)}.${extension(file.type)}`;
  const blob = await upload(pathname, file, {
    access: "public",
    handleUploadUrl: HANDLE_UPLOAD_URL,
    headers: { Authorization: `Bearer ${key}` },
    contentType: file.type,
    onUploadProgress: ({ percentage }) => onProgress?.(Math.round(percentage)),
  });
  return blob.url;
}

/* ------------------------------------------------------------------ */
/* Upscale                                                             */
/* ------------------------------------------------------------------ */

export async function loadBitmap(src: string): Promise<ImageBitmap> {
  const res = await fetch(src, { mode: "cors", cache: "force-cache" });
  if (!res.ok) throw new Error(`Couldn't load ${src} (${res.status})`);
  return createImageBitmap(await res.blob());
}

/** One separable [1 2 1] / 4 blur pass over premultiplied RGB (alpha untouched). */
function blur3(src: Float32Array, w: number, h: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = Math.max(0, x - 1);
      const r = Math.min(w - 1, x + 1);
      for (let c = 0; c < 3; c++) {
        const i = (y * w + x) * 3 + c;
        tmp[i] = (src[(y * w + l) * 3 + c] + 2 * src[i] + src[(y * w + r) * 3 + c]) / 4;
      }
    }
  }
  for (let y = 0; y < h; y++) {
    const u = Math.max(0, y - 1);
    const d = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        const i = (y * w + x) * 3 + c;
        out[i] = (tmp[(u * w + x) * 3 + c] + 2 * tmp[i] + tmp[(d * w + x) * 3 + c]) / 4;
      }
    }
  }
  return out;
}

/**
 * Upscales to `target` px (square poses; the longer edge for anything else):
 * stepped high-quality resampling (≤1.5× per step, so it doesn't go mushy),
 * a light denoise, then an unsharp mask to restore edge contrast. Returns a
 * WebP at quality 0.85. It can't invent detail — it makes the soft source
 * read cleaner when stretched to full-screen.
 */
export async function upscaleImage(src: string, target = POSE_MAX_EDGE): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await loadBitmap(src);
  const scale = target / Math.max(bitmap.width, bitmap.height);
  const W = Math.round(bitmap.width * scale);
  const H = Math.round(bitmap.height * scale);

  let canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  while (canvas.width < W) {
    const next = document.createElement("canvas");
    next.width = Math.min(W, Math.round(canvas.width * 1.5));
    next.height = Math.min(H, Math.round(canvas.height * 1.5));
    const ctx = next.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, 0, 0, next.width, next.height);
    canvas = next;
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  const img = ctx.getImageData(0, 0, W, H);
  const px = img.data;
  const n = W * H;

  // Premultiplied RGB so transparent texels don't bleed into the edges.
  const rgb = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = px[i * 4 + 3] / 255;
    rgb[i * 3] = px[i * 4] * a;
    rgb[i * 3 + 1] = px[i * 4 + 1] * a;
    rgb[i * 3 + 2] = px[i * 4 + 2] * a;
  }
  const soft = blur3(rgb, W, H);
  const den = new Float32Array(rgb.length);
  for (let i = 0; i < rgb.length; i++) den[i] = rgb[i] * 0.65 + soft[i] * 0.35; // denoise
  const wide = blur3(blur3(den, W, H), W, H);
  for (let i = 0; i < n; i++) {
    const a = px[i * 4 + 3] / 255;
    if (a < 1 / 255) continue;
    for (let c = 0; c < 3; c++) {
      const j = i * 3 + c;
      const sharp = den[j] + 0.7 * (den[j] - wide[j]); // unsharp mask
      px[i * 4 + c] = Math.min(255, Math.max(0, sharp / a));
    }
  }
  ctx.putImageData(img, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (!blob) throw new Error("This browser can't encode WebP");
  return { blob, width: W, height: H };
}
