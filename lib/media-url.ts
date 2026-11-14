/**
 * Stored media URLs carry an absolute origin (<site>/media/<key>) — the one
 * NEXT_PUBLIC_SITE_URL had at upload time, which may be a domain that isn't
 * live yet, or production when read from localhost / a preview deploy (where
 * its redirect is cross-origin and a CORS fetch() fails on it). Every
 * deployment serves the same /media route, so any /media/<key> URL becomes
 * the path alone and loads from whichever origin the page is on. Pure (same
 * answer on the server and in the browser — safe in rendered markup); other
 * URLs pass through.
 */
export function sameOriginMedia(src: string): string {
  try {
    const u = new URL(src, "http://local.invalid");
    return u.pathname.startsWith("/media/") ? `${u.pathname}${u.search}` : src;
  } catch {
    return src;
  }
}
