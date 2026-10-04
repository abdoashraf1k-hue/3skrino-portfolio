/** Shared (server + browser) CSS easing helpers for admin → Motion Lab. */

export type Bezier = [number, number, number, number];

export const EASE_KEYWORDS: Record<string, Bezier> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

const BEZIER = /^cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/;

/** CSS easing → control points; null when it isn't a valid keyword / cubic-bezier (x in 0–1, y in -2…3). */
export function parseEasing(value: string): Bezier | null {
  const v = value.trim().toLowerCase();
  if (EASE_KEYWORDS[v]) return EASE_KEYWORDS[v];
  const m = BEZIER.exec(v);
  if (!m) return null;
  const p = m.slice(1).map(Number) as Bezier;
  if (p.some((n) => !Number.isFinite(n) || n < -2 || n > 3) || p[0] < 0 || p[0] > 1 || p[2] < 0 || p[2] > 1) return null;
  return p;
}

const r = (n: number) => Math.round(n * 1000) / 1000;
export const bezierCss = (p: Bezier) => `cubic-bezier(${p.map(r).join(", ")})`;
