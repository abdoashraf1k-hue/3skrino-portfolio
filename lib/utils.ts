type ClassValue = string | false | null | undefined;

/** Join class names, skipping falsy values. */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Legacy Cloudinary URLs are already optimised at the source, and re-fetching
 * them through next/image times out upstream — render those `unoptimized`.
 * `/media/…` URLs (private bucket) answer with a 302 to a short-lived
 * presigned URL, which the optimiser can't follow or cache — also `unoptimized`.
 * Vercel Blob (and everything else) still goes through the optimiser.
 */
export function skipImageOptimizer(src: string): boolean {
  if (src.startsWith("https://res.cloudinary.com")) return true;
  if (src.startsWith("/media/")) return true;
  try {
    return new URL(src).pathname.startsWith("/media/");
  } catch {
    return false;
  }
}

/** Zero-padded index label: 1 → "01". */
export function pad(n: number, length = 2): string {
  return String(n).padStart(length, "0");
}

/** Shared reveal easing — cubic-bezier(0.16, 1, 0.3, 1). */
export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Container classes used by every section. */
/** Page container — max width from the brand grid (admin → Brand → Grid). */
export const CONTAINER = "mx-auto w-full max-w-[var(--grid-max,1600px)] px-6 md:px-12 lg:px-20";

export function formatCairoTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Africa/Cairo",
  }).format(date);
}
