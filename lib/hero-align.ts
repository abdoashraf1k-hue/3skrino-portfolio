/**
 * Pose alignment: find how far a pose's shoulders sit from the reference
 * (centre) pose's, so every pose can be drawn on the same anchor. Heads move
 * between poses by design — the torso doesn't, so only the lower band of the
 * alpha mask is compared. Pure image-difference search, coarse → fine:
 * ±12px at 64px, then ±2px around the best at 128px.
 *
 * Runs in the browser (canvas). Images must be same-origin or CORS-enabled;
 * otherwise the read throws and callers treat the pose as unaligned.
 */

const N = 128;
/** Torso band, as a fraction of the image height from the top. */
const BAND = { from: 0.6, to: 0.94 };

export type Mask = { size: number; data: Uint8Array };

/** Alpha channel of `img`, scaled to size × size. */
export function alphaMask(img: CanvasImageSource & { width: number; height: number }, size = N): Mask {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(img, 0, 0, size, size);
  const rgba = ctx.getImageData(0, 0, size, size).data;
  const data = new Uint8Array(size * size);
  for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4 + 3];
  return { size, data };
}

function downsample(m: Mask): Mask {
  const size = m.size / 2;
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * 2 * m.size + x * 2;
      data[y * size + x] = (m.data[i] + m.data[i + 1] + m.data[i + m.size] + m.data[i + m.size + 1]) >> 2;
    }
  }
  return { size, data };
}

/** Sum of squared alpha differences over the torso band with `pose` shifted by (dx, dy). */
function cost(ref: Mask, pose: Mask, dx: number, dy: number): number {
  const n = ref.size;
  const y0 = Math.floor(n * BAND.from);
  const y1 = Math.floor(n * BAND.to);
  let e = 0;
  for (let y = y0; y < y1; y++) {
    const sy = y + dy;
    for (let x = 0; x < n; x++) {
      const sx = x + dx;
      const a = sy >= 0 && sy < n && sx >= 0 && sx < n ? pose.data[sy * n + sx] : 0;
      const d = a - ref.data[y * n + x];
      e += d * d;
    }
  }
  return e;
}

function search(ref: Mask, pose: Mask, cx: number, cy: number, r: number): { dx: number; dy: number; e: number } {
  let best = { dx: cx, dy: cy, e: Infinity };
  for (let dy = cy - r; dy <= cy + r; dy++) {
    for (let dx = cx - r; dx <= cx + r; dx++) {
      const e = cost(ref, pose, dx, dy);
      if (e < best.e) best = { dx, dy, e };
    }
  }
  return best;
}

/**
 * The UV offset to ADD when sampling `pose` so its shoulders land where the
 * reference's are (x right, y up — texture space).
 */
export function anchorOffset(ref: Mask, pose: Mask): [number, number] {
  const coarse = search(downsample(ref), downsample(pose), 0, 0, 12);
  const fine = search(ref, pose, coarse.dx * 2, coarse.dy * 2, 2);
  // Image rows run downward; texture v runs upward.
  return [fine.dx / ref.size, -fine.dy / ref.size];
}

/** Offsets for every image against images[refIndex]; null where the image couldn't be read. */
export function alignAll(images: (CanvasImageSource & { width: number; height: number })[], refIndex: number): ([number, number] | null)[] {
  let ref: Mask;
  try {
    ref = alphaMask(images[refIndex]);
  } catch {
    return images.map(() => null);
  }
  return images.map((img, i) => {
    if (i === refIndex) return [0, 0];
    try {
      return anchorOffset(ref, alphaMask(img));
    } catch {
      return null;
    }
  });
}

/** Drift in pixels of a 1600px frame, for the admin audit. */
export const driftPx = (o: [number, number], frame = 1600) => Math.round(Math.hypot(o[0], o[1]) * frame);
