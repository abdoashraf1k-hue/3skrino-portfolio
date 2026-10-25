import { KEY_PATTERN, MEDIA_ROUTE } from "@/lib/admin/storage/contract";

/**
 * Playback URLs. Stored URLs in data/projects.ts are never rewritten — the
 * optional Cloudflare proxy (workers/b2-proxy) is applied at render time, so
 * clearing NEXT_PUBLIC_B2_PROXY_URL instantly restores the /media route.
 */

const PROXY = (process.env.NEXT_PUBLIC_B2_PROXY_URL ?? "").trim().replace(/\/+$/, "");

/** The bucket key behind a stored `…/media/<key>` URL, or null for any other URL (Blob, Cloudinary…). */
export function mediaKeyOf(url: string): string | null {
  try {
    const { pathname } = new URL(url, "https://placeholder.invalid");
    const prefix = `${MEDIA_ROUTE}/`;
    if (!pathname.startsWith(prefix)) return null;
    const key = pathname.slice(prefix.length).split("/").map(decodeURIComponent).join("/");
    return KEY_PATTERN.test(key) ? key : null;
  } catch {
    return null;
  }
}

/** `<proxy>/<key>` for B2 media when the proxy is configured; any other URL unchanged. */
export function playbackUrl(url: string): string {
  if (!PROXY) return url;
  const key = mediaKeyOf(url);
  return key ? `${PROXY}/${key}` : url;
}
