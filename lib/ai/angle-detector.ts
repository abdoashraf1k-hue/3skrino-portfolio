"use client";

import type { Human } from "@vladmandic/human";
import type { SequenceFrame } from "@/data/hero-config";
import { loadBitmap } from "@/lib/admin/hero-assets";

/**
 * Sprint 14 — the "Smooth Reality" angle detector. Runs @vladmandic/human in
 * the browser (WebGL; models from jsDelivr, pinned to the installed version)
 * to read a face's head pose, and maps a set of yaws onto a 360° grid.
 *
 * Angles are degrees. Yaw is normalised to [-180, 180): 0 faces the camera,
 * ±180 is the back of the head. A face detector can't see past about ±90°,
 * so frames of the back of the head report no face (null) — their angle
 * comes from their place in the sequence instead (fitSequenceAngles).
 */

export type HeadPose = { yaw: number; pitch: number; roll: number };

export type Coverage = {
  /** Grid angles with at least one frame, ascending. */
  detectedAngles: number[];
  /** Grid angles with none, ascending. */
  missingAngles: number[];
  /** 0–100, share of the grid that is covered. */
  coveragePercentage: number;
};

/** 36 steps of 10°: one frame per step is the target for a smooth turn. */
export const GRID_STEP = 10;

const HUMAN_VERSION = "3.3.6";
const MODELS = `https://cdn.jsdelivr.net/npm/@vladmandic/human@${HUMAN_VERSION}/models/`;
const DEG = 180 / Math.PI;

/** Any angle → [-180, 180). */
export const normAngle = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

/** The grid angle a yaw falls in. */
export const gridAngle = (yaw: number, step = GRID_STEP) => normAngle(Math.round(yaw / step) * step);

/** Shortest signed distance from a to b, in degrees. */
export const angleDelta = (a: number, b: number) => normAngle(b - a);

let human: Promise<Human> | null = null;

/** One Human instance for the session, created (and its face models fetched) on first use. */
function getHuman(): Promise<Human> {
  human ??= (async () => {
    const { Human } = await import("@vladmandic/human");
    const h = new Human({
      modelBasePath: MODELS,
      backend: "webgl",
      debug: false,
      warmup: "none",
      cacheSensitivity: 0,
      filter: { enabled: false },
      face: {
        enabled: true,
        detector: { rotation: true, maxDetected: 1, minConfidence: 0.3 },
        mesh: { enabled: true },
        iris: { enabled: false },
        description: { enabled: false },
        emotion: { enabled: false },
        antispoof: { enabled: false },
        liveness: { enabled: false },
      },
      body: { enabled: false },
      hand: { enabled: false },
      object: { enabled: false },
      gesture: { enabled: false },
      segmentation: { enabled: false },
    });
    await h.load();
    // Human logs a failed model fetch instead of throwing: check the face models really arrived.
    const missing = h.models
      .list()
      .filter((m) => /blazeface|facemesh/.test(m.name) && !m.loaded)
      .map((m) => String(m.url ?? m.name));
    if (missing.length) throw new Error(`face model couldn't load (${missing.join(", ")})`);
    return h;
  })().catch((err) => {
    human = null; // let a later call retry (e.g. the CDN was briefly unreachable)
    console.error("[angle-detector] face model failed to load", { from: MODELS, err });
    throw err instanceof Error && err.message.startsWith("face model") ? err : new Error(`face model couldn't load from ${MODELS} — ${err instanceof Error ? err.message : String(err)}`);
  });
  return human;
}

/** Head pose of the (largest) face in an image, or null when no face is found. */
export async function detectAngle(input: string | Blob): Promise<HeadPose | null> {
  // Model and image load side by side; whichever fails says which it was (see fetchImage / getHuman).
  const [h, bitmap] = await Promise.all([getHuman(), typeof input === "string" ? loadBitmap(input) : createImageBitmap(input)]);
  try {
    const res = await h.detect(bitmap);
    if (res.error) throw new Error(`face detection failed: ${res.error}`);
    const angle = res.face[0]?.rotation?.angle;
    if (!angle) return null;
    const r1 = (v: number) => Math.round(v * DEG * 10) / 10;
    return { yaw: normAngle(r1(angle.yaw)), pitch: r1(angle.pitch), roll: r1(angle.roll) };
  } finally {
    bitmap.close();
  }
}

/** Maps yaws onto the 360° grid. */
export function analyzeCoverage(yaws: number[], step = GRID_STEP): Coverage {
  const grid = Array.from({ length: Math.round(360 / step) }, (_, i) => -180 + i * step);
  const hit = new Set(yaws.map((y) => gridAngle(y, step)));
  const detectedAngles = grid.filter((g) => hit.has(g));
  return {
    detectedAngles,
    missingAngles: grid.filter((g) => !hit.has(g)),
    coveragePercentage: Math.round((detectedAngles.length / grid.length) * 100),
  };
}

/** Grid angles within `reach`° of a covered one (what a pose-editing model can rotate a real frame to). */
export function reachableAngles(missing: number[], covered: number[], reach: number): number[] {
  return missing.filter((m) => covered.some((c) => Math.abs(angleDelta(c, m)) <= reach + 1e-6));
}

const signed = (d: number) => `${d > 0 ? "+" : ""}${d}°`;

/** [-80, -70, -60, 40] → "-80° to -60°, +40°" (runs of consecutive grid steps collapse). */
export function formatRanges(angles: number[], step = GRID_STEP): string {
  const sorted = [...angles].sort((a, b) => a - b);
  const runs: [number, number][] = [];
  for (const a of sorted) {
    const last = runs.at(-1);
    if (last && a - last[1] === step) last[1] = a;
    else runs.push([a, a]);
  }
  return runs.map(([a, b]) => (a === b ? signed(a) : `${signed(a)} to ${signed(b)}`)).join(", ");
}

/**
 * Turns detections into a frame angle for every frame. Frames with a face take
 * the detected yaw. The rest (profiles and the back of the head) are placed by
 * their position in the sequence: a straight line fitted through the detected
 * frames (angle ≈ direction × even spacing + offset), so they keep turning the
 * same way as the faces around them. Without detections the angles stay.
 */
export function fitSequenceAngles(frames: SequenceFrame[], poses: (HeadPose | null)[]): SequenceFrame[] {
  const n = frames.length;
  const even = frames.map((_, i) => normAngle((i * 360) / n));
  const known = poses.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
  if (!known.length) return frames;

  // Direction: does the detected yaw rise or fall as the sequence goes on?
  let dir = 1;
  if (known.length > 1) {
    let trend = 0;
    for (let k = 1; k < known.length; k++) trend += angleDelta(even[known[k - 1]], even[known[k]]) * angleDelta(poses[known[k - 1]]!.yaw, poses[known[k]]!.yaw);
    dir = trend < 0 ? -1 : 1;
  }
  // Offset: circular mean of (detected − direction × even).
  let sx = 0;
  let sy = 0;
  for (const i of known) {
    const d = (poses[i]!.yaw - dir * even[i]) / DEG;
    sx += Math.cos(d);
    sy += Math.sin(d);
  }
  const offset = Math.atan2(sy, sx) * DEG;
  return frames.map((f, i) => ({ ...f, angle: Math.round((poses[i] ? poses[i].yaw : normAngle(dir * even[i] + offset)) * 10) / 10 }));
}
