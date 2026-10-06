/**
 * Sprint 11 — derives expression poses from the user's own portraits.
 *
 *   node scripts/generate-poses.mjs            # writes public/hero/poses/<id>.webp
 *   node scripts/generate-poses.mjs --preview  # also writes a contact sheet to ./pose-sheet.png
 *
 * Every pose starts from an existing photo, so lighting, grain and identity
 * stay the user's. Each recipe stacks three things, applied as one inverse
 * mapping with bilinear sampling (premultiplied alpha, no halos):
 *
 *   1. local warps  — compact-support displacement "handles" (lift a lip
 *                     corner, drop the jaw, raise the brow) and lens bulges;
 *   2. a global affine — head tilt / lean-in (rotate + scale about a pivot);
 *   3. a light grade — the rim-light tint the expression pulls toward.
 *
 * Landmarks are in the 1024×1024 frame every pose shares. Re-running the
 * script is deterministic: same inputs → byte-identical outputs.
 *
 * sharp is already installed as a dependency of Next's image optimiser.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIZE = 1024;
const src = (id) => path.join(ROOT, "public/hero", id === "center" ? "silhouette-1600.webp" : `poses/${id}.webp`);

/* ------------------------------------------------------------------ */
/* Recipes                                                             */
/* ------------------------------------------------------------------ */

/** Displacement handle: content near (x, y) moves by (dx, dy), falling off to 0 at radius (rx, ry). */
const h = (x, y, rx, ry, dx, dy) => ({ kind: "move", x, y, rx, ry, dx, dy });
/** `shade: [{ x, y, rx, ry, amount }]` darkens a soft ellipse in OUTPUT space — the gap of a parted mouth. */
/** Radial bulge (k > 0 magnifies, k < 0 pinches); sy squashes it vertically only when ≠ 1. */
const bulge = (x, y, rx, ry, k, sy = 1) => ({ kind: "bulge", x, y, rx, ry, k, sy });

const RECIPES = [
  {
    id: "smile",
    base: "center",
    note: "lip corners and cheeks lifted, warm rim",
    warps: [
      h(435, 655, 44, 32, -6, -14),
      h(590, 655, 44, 32, 6, -14),
      h(420, 612, 66, 52, 0, -7),
      h(604, 612, 66, 52, 0, -7),
      h(512, 664, 60, 18, 0, -3),
    ],
    grade: { tint: [1.07, 1.01, 0.9], amount: 0.6 },
  },
  {
    id: "laugh",
    base: "up",
    note: "head back, jaw dropped, corners up",
    warps: [
      h(470, 522, 115, 72, 0, 15),
      h(470, 590, 150, 70, 0, 8),
      h(415, 490, 36, 28, -7, -11),
      h(540, 480, 36, 28, 7, -12),
    ],
    shade: [{ x: 475, y: 503, rx: 58, ry: 13, amount: 0.55 }],
    affine: { rotate: -4, scale: 1.02, pivot: [512, 760] },
    grade: { tint: [1.1, 1.02, 0.86], amount: 0.7, brightness: 1.04 },
  },
  {
    id: "surprise",
    base: "center",
    note: "jaw drops, mouth narrows to an O, brow + frames lift, lenses widen, leans in",
    warps: [
      h(512, 700, 100, 60, 0, 16),
      h(512, 762, 150, 80, 0, 10),
      h(435, 655, 34, 28, 12, 0),
      h(590, 655, 34, 28, -12, 0),
      h(512, 330, 270, 95, 0, -11),
      h(512, 455, 270, 70, 0, -4),
      bulge(385, 460, 115, 78, 0.06),
      bulge(630, 460, 115, 78, 0.06),
    ],
    affine: { rotate: 0, scale: 1.03, pivot: [512, 600] },
    shade: [{ x: 512, y: 672, rx: 30, ry: 22, amount: 0.6 }],
    grade: { tint: [0.96, 1.0, 1.08], amount: 0.5, brightness: 1.05 },
  },
  {
    id: "anger",
    base: "hard-left",
    note: "corner pulled down, jaw clenched, brow pressed, chin down, red rim",
    warps: [
      h(315, 552, 36, 28, 0, 7),
      h(285, 545, 40, 18, 0, 2),
      h(292, 602, 92, 60, 2, -4),
      h(450, 355, 210, 70, 0, 6),
    ],
    affine: { rotate: 3, scale: 1.02, pivot: [512, 760] },
    grade: { tint: [1.16, 0.9, 0.86], amount: 0.75, contrast: 1.08 },
  },
  {
    // Not mirrored: flipping slight-left reverses the "3SKRINO" lettering on the nose bridge.
    id: "side-eye",
    base: "slight-right",
    note: "squinting lenses, one-sided smirk, slight tilt",
    warps: [
      bulge(380, 440, 120, 70, -0.05, 0.92),
      bulge(560, 430, 110, 70, -0.05, 0.92),
      h(640, 620, 36, 28, 3, -7),
      h(545, 628, 30, 24, 0, 3),
      h(470, 360, 230, 60, 0, 4),
    ],
    affine: { rotate: -3, scale: 1.01, pivot: [512, 800] },
    grade: { tint: [1.0, 0.98, 1.04], amount: 0.4, contrast: 1.05 },
  },
  {
    id: "talking",
    base: "center",
    note: "jaw slightly open — alternates with center for lip-flap",
    warps: [h(512, 690, 92, 46, 0, 9), h(512, 752, 140, 72, 0, 7), h(512, 645, 60, 14, 0, -1)],
    shade: [{ x: 512, y: 662, rx: 44, ry: 7, amount: 0.5 }],
  },
  {
    id: "emphasis",
    base: "slight-right",
    note: "leans in, chin tilts, mouth open mid-word",
    warps: [h(590, 662, 92, 50, 0, 12), h(590, 720, 130, 70, 0, 7)],
    shade: [{ x: 600, y: 650, rx: 38, ry: 9, amount: 0.5 }],
    affine: { rotate: 5, scale: 1.05, pivot: [512, 620] },
    grade: { tint: [1.04, 1.02, 0.96], amount: 0.4, brightness: 1.06 },
  },
  {
    id: "pensive",
    base: "down",
    note: "head tilted, lips pursed to one side, cooler and dimmer",
    warps: [h(470, 678, 32, 20, -3, 2), h(555, 680, 30, 20, -4, 0)],
    affine: { rotate: -6, scale: 1.02, pivot: [512, 780], translate: [-10, 0] },
    grade: { tint: [0.94, 0.98, 1.08], amount: 0.6, brightness: 0.95, saturation: 0.9 },
  },
];

/* ------------------------------------------------------------------ */
/* Warp                                                                */
/* ------------------------------------------------------------------ */

/** Compact smooth falloff: 1 at the centre, 0 at the ellipse edge. */
function falloff(dx, dy, rx, ry) {
  const r2 = (dx / rx) ** 2 + (dy / ry) ** 2;
  return r2 >= 1 ? 0 : (1 - r2) ** 2;
}

/** Output pixel → where to sample the base image. */
function makeInverse(recipe) {
  const a = recipe.affine ?? { rotate: 0, scale: 1, pivot: [512, 512] };
  const [px, py] = a.pivot;
  const [tx, ty] = a.translate ?? [0, 0];
  const th = (-(a.rotate ?? 0) * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const s = a.scale ?? 1;
  const warps = recipe.warps ?? [];

  return (x, y) => {
    // Undo the affine: translate, then rotate/scale about the pivot.
    let qx = x - tx - px;
    let qy = y - ty - py;
    [qx, qy] = [(qx * cos - qy * sin) / s + px, (qx * sin + qy * cos) / s + py];

    // Undo the local warps (first-order inverse — displacements are small).
    let sx = qx;
    let sy = qy;
    for (const w of warps) {
      const dx = qx - w.x;
      const dy = qy - w.y;
      const f = falloff(dx, dy, w.rx, w.ry);
      if (!f) continue;
      if (w.kind === "move") {
        sx -= w.dx * f;
        sy -= w.dy * f;
      } else {
        const m = 1 + w.k * f;
        sx -= dx - dx / m;
        sy -= dy - dy / (m * (1 + (w.sy - 1) * f));
      }
    }
    return [sx, sy];
  };
}

function premultiply(rgba) {
  const out = new Float32Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255;
    out[i] = rgba[i] * a;
    out[i + 1] = rgba[i + 1] * a;
    out[i + 2] = rgba[i + 2] * a;
    out[i + 3] = rgba[i + 3];
  }
  return out;
}

/** Bilinear, clamp-to-edge (the jacket is cut by the bottom edge, so clamping extends it cleanly). */
function sample(pm, x, y, out) {
  const cx = Math.min(SIZE - 1.001, Math.max(0, x));
  const cy = Math.min(SIZE - 1.001, Math.max(0, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const fx = cx - x0;
  const fy = cy - y0;
  const i00 = (y0 * SIZE + x0) * 4;
  const i10 = i00 + 4;
  const i01 = i00 + SIZE * 4;
  const i11 = i01 + 4;
  for (let c = 0; c < 4; c++) {
    const top = pm[i00 + c] * (1 - fx) + pm[i10 + c] * fx;
    const bot = pm[i01 + c] * (1 - fx) + pm[i11 + c] * fx;
    out[c] = top * (1 - fy) + bot * fy;
  }
}

function grade(rgb, g) {
  if (!g) return rgb;
  const [r, gr, b] = rgb;
  const lum = (0.2126 * r + 0.7152 * gr + 0.0722 * b) / 255;
  // The tint rides the highlights (the rim light), not the shadowed face.
  const t = (g.amount ?? 0.5) * Math.min(1, lum * 1.6);
  let out = [r * (1 + (g.tint[0] - 1) * t), gr * (1 + (g.tint[1] - 1) * t), b * (1 + (g.tint[2] - 1) * t)];
  if (g.saturation !== undefined) {
    const l = 0.2126 * out[0] + 0.7152 * out[1] + 0.0722 * out[2];
    out = out.map((v) => l + (v - l) * g.saturation);
  }
  if (g.contrast !== undefined) out = out.map((v) => (v - 128) * g.contrast + 128);
  if (g.brightness !== undefined) out = out.map((v) => v * g.brightness);
  return out;
}

async function render(recipe) {
  const { data } = await sharp(src(recipe.base)).resize(SIZE, SIZE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pm = premultiply(data);
  const inv = makeInverse(recipe);
  const out = Buffer.alloc(SIZE * SIZE * 4);
  const px = [0, 0, 0, 0];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const [sx, sy] = inv(x + 0.5, y + 0.5);
      sample(pm, sx - 0.5, sy - 0.5, px);
      const i = (y * SIZE + x) * 4;
      const a = px[3];
      if (a < 0.5) continue;
      const k = 255 / a;
      let [r, g, b] = grade([px[0] * k, px[1] * k, px[2] * k], recipe.grade);
      for (const d of recipe.shade ?? []) {
        const m = 1 - d.amount * falloff(x - d.x, y - d.y, d.rx, d.ry);
        r *= m;
        g *= m;
        b *= m;
      }
      out[i] = Math.max(0, Math.min(255, Math.round(r)));
      out[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
      out[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
      out[i + 3] = Math.round(a);
    }
  }
  return sharp(out, { raw: { width: SIZE, height: SIZE, channels: 4 } });
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

const preview = process.argv.includes("--preview");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const tiles = [];

for (const recipe of RECIPES) {
  if (only && !only.includes(recipe.id)) continue;
  const img = await render(recipe);
  const file = path.join(ROOT, "public/hero/poses", `${recipe.id}.webp`);
  await img.clone().webp({ quality: 86, alphaQuality: 90, effort: 6 }).toFile(file);
  console.log(`✓ ${recipe.id.padEnd(9)} ← ${recipe.base.padEnd(12)} ${recipe.note}`);
  if (preview) {
    const pair = await Promise.all(
      [sharp(src(recipe.base)).resize(SIZE, SIZE), img].map((s) =>
        s.clone().flatten({ background: "#7a8899" }).resize(400, 400).png().toBuffer(),
      ),
    );
    tiles.push(pair);
  }
}

if (preview && tiles.length) {
  const composites = tiles.flatMap(([before, after], i) => [
    { input: before, left: (i % 2) * 800, top: Math.floor(i / 2) * 400 },
    { input: after, left: (i % 2) * 800 + 400, top: Math.floor(i / 2) * 400 },
  ]);
  const rows = Math.ceil(tiles.length / 2);
  await sharp({ create: { width: 1600, height: rows * 400, channels: 3, background: "#7a8899" } })
    .composite(composites)
    .png()
    .toFile(path.join(process.cwd(), "pose-sheet.png"));
  console.log("Contact sheet → pose-sheet.png (before | after)");
}
