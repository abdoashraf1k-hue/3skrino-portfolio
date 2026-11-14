/**
 * Sprint 15.5 — removes a black studio backdrop from a photo, by connectivity.
 *
 * A brightness key can't tell a black backdrop from dark skin, black hair or
 * a dark jacket — it would hollow the subject out. Two passes instead:
 *   1. flood fill: only near-black pixels connected to the image border
 *      through near-black pixels are backdrop candidates;
 *   2. row spans: per row, everything between the leftmost and rightmost
 *      real subject run (≥ 4 brighter pixels, so specks don't count) is
 *      subject — a pure-black jacket the fill leaked into across the
 *      shoulders comes back, and nothing inside the silhouette is lost.
 * Pixels on the boundary get a soft alpha ramp by brightness (anti-aliased
 * edge). Tuned on the real frames: backdrop ≈ 2/255, subject darks 8–24/255.
 *
 * Skipped (returns null) when the image already has transparency, or when
 * the backdrop isn't black (fewer than 15% of pixels would be cleared).
 */

/** max(r,g,b) at or below this is backdrop when reachable from the border. */
const HARD = 8;
/** A run this long of non-backdrop pixels marks the silhouette's edge in a row. */
const RUN = 4;
/** Boundary pixels between HARD and SOFT fade in (anti-aliased edge). */
const SOFT = 26;
const MIN_CLEARED = 0.15;

export function matteBlackBackdrop(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const d = image.data;
  const n = width * height;

  // Already transparent somewhere on the border → it has its own matte.
  for (const i of [0, width - 1, n - width, n - 1]) if (d[i * 4 + 3] < 250) return null;

  const level = (p: number) => Math.max(d[p * 4], d[p * 4 + 1], d[p * 4 + 2]);
  const bg = new Uint8Array(n); // 1 = backdrop
  const stack = new Int32Array(n);
  let top = 0;
  const seed = (p: number) => {
    if (!bg[p] && level(p) <= HARD) {
      bg[p] = 1;
      stack[top++] = p;
    }
  };
  for (let x = 0; x < width; x++) {
    seed(x);
    seed(n - width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (top) {
    const p = stack[--top];
    const x = p % width;
    if (x > 0) seed(p - 1);
    if (x < width - 1) seed(p + 1);
    if (p >= width) seed(p - width);
    if (p < n - width) seed(p + width);
  }

  // Row spans: inside the silhouette's outer edges is always subject.
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let left = -1;
    let right = -1;
    for (let x = 0, run = 0; x < width; x++) {
      run = bg[row + x] ? 0 : run + 1;
      if (run === RUN) {
        left = x - RUN + 1;
        break;
      }
    }
    if (left < 0) continue;
    for (let x = width - 1, run = 0; x >= 0; x--) {
      run = bg[row + x] ? 0 : run + 1;
      if (run === RUN) {
        right = x + RUN - 1;
        break;
      }
    }
    bg.fill(0, row + left, row + right + 1);
  }

  let cleared = 0;
  for (let p = 0; p < n; p++) cleared += bg[p];
  if (cleared < n * MIN_CLEARED) return null;

  // Sprint 15.6 — two-ring feather. Ring 1 touches the backdrop, ring 2 touches ring 1.
  // Near-black boundary pixels (the dark rim around curls and shoulders) fade by
  // brightness — fully in ring 1, half-strength in ring 2 — so the edge melts into
  // whatever is behind instead of leaving a dark outline. Bright edges stay crisp.
  const ring = new Uint8Array(n); // 1 = ring 1, 2 = ring 2
  const touches = (p: number, mark: Uint8Array, value: number) => {
    const x = p % width;
    return (
      (x > 0 && mark[p - 1] === value) ||
      (x < width - 1 && mark[p + 1] === value) ||
      (p >= width && mark[p - width] === value) ||
      (p < n - width && mark[p + width] === value)
    );
  };
  for (let p = 0; p < n; p++) if (!bg[p] && touches(p, bg, 1)) ring[p] = 1;
  for (let p = 0; p < n; p++) if (!bg[p] && !ring[p] && touches(p, ring, 1)) ring[p] = 2;

  const ramp = (v: number) => Math.min(1, Math.max(0, (v - HARD) / (SOFT - HARD)));
  for (let p = 0; p < n; p++) {
    if (bg[p]) {
      d[p * 4 + 3] = 0;
      continue;
    }
    if (!ring[p]) continue;
    const v = level(p);
    if (v >= SOFT) continue;
    const a = ring[p] === 1 ? ramp(v) : 0.5 + 0.5 * ramp(v);
    d[p * 4 + 3] = Math.round(a * 255);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
