type ClassValue = string | false | null | undefined;

/** Join class names, skipping falsy values. */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Zero-padded index label: 1 → "01". */
export function pad(n: number, length = 2): string {
  return String(n).padStart(length, "0");
}

/** Shared reveal easing — cubic-bezier(0.16, 1, 0.3, 1). */
export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Container classes used by every section. */
export const CONTAINER = "mx-auto w-full max-w-[1600px] px-6 md:px-12 lg:px-20";

export function formatCairoTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Africa/Cairo",
  }).format(date);
}
