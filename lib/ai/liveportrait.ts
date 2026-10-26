import "server-only";
import { Client, handle_file } from "@gradio/client";

/**
 * Sprint 14b — free head-pose editing on Hugging Face Spaces (no payment).
 *
 * Both plans run the same open-source app: LivePortrait's expression editor
 * (the model behind fofr/expression-editor), which re-renders the photo with
 * the head turned — identity preserved, at most ±20° per pass.
 *
 *  - Plan A: fffiloni/expression-editor on ZeroGPU — ~8 s per image, but
 *    ZeroGPU has a small free daily quota (per HF account with HF_TOKEN,
 *    else shared per IP).
 *  - Plan B: CPU copies of the same app — no GPU quota, ~25 s+ per image,
 *    tried in order until one answers.
 *
 * The official KlingTeam/LivePortrait Space isn't usable here: its image API
 * only retargets eye / lip openness, it can't turn the head.
 *
 * HF_SPACE_PRIMARY / HF_SPACE_FALLBACKS (comma-separated) override the lists,
 * e.g. with your own duplicate of the Space.
 */

export const PLAN_A_SPACES = ["fffiloni/expression-editor"];
export const PLAN_B_SPACES = ["slfrtny/expression-editor", "ahmad085awbx/expression-editor", "Native72/expression-editor"];

/** The model's rotation limit per pass. */
export const MAX_ROTATE = 20;

export type PoseEdit = { yaw: number; pitch: number };

export type SpaceErrorCode = "quota" | "busy" | "down" | "failed";

export class SpaceError extends Error {
  constructor(
    message: string,
    readonly code: SpaceErrorCode,
    readonly space: string,
  ) {
    super(message);
  }
}

const list = (env: string | undefined, fallback: string[]) => {
  const v = env
    ?.split(",")
    .map((s) => s.trim())
    .filter((s) => /^[\w.-]+\/[\w.-]+$/.test(s));
  return v?.length ? v : fallback;
};

export const planA = () => list(process.env.HF_SPACE_PRIMARY, PLAN_A_SPACES);
export const planB = () => list(process.env.HF_SPACE_FALLBACKS, PLAN_B_SPACES);

function hfToken(): `hf_${string}` | undefined {
  const t = process.env.HF_TOKEN?.trim();
  return t?.startsWith("hf_") ? (t as `hf_${string}`) : undefined;
}

/** Gradio / ZeroGPU errors → what the admin should hear. */
function classify(err: unknown, space: string): SpaceError {
  const raw = err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err);
  const m = raw || "unknown error";
  if (/quota|exceeded|gpu.*(limit|duration)|pro (account|subscription)/i.test(m)) return new SpaceError(`ZeroGPU quota exceeded on ${space}`, "quota", space);
  if (/queue (is )?full|too many|rate.?limit|429|timed? ?out|timeout/i.test(m)) return new SpaceError(`${space} is busy (${m.slice(0, 120)})`, "busy", space);
  if (/sleep|paused|building|runtime_error|not found|404|503|502|could not resolve|fetch failed|ECONN|ENOTFOUND|connect/i.test(m))
    return new SpaceError(`${space} is down or asleep (${m.slice(0, 120)})`, "down", space);
  return new SpaceError(`${space}: ${m.slice(0, 200)}`, "failed", space);
}

const withTimeout = <T,>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${what} timed out after ${Math.round(ms / 1000)}s`)), ms))]);

/** One edit on one Space → the result image. Throws SpaceError. */
export async function editOnSpace(space: string, image: Blob, pose: PoseEdit, timeoutMs: number): Promise<Blob> {
  const clamp = (v: number) => Math.round(Math.min(MAX_ROTATE, Math.max(-MAX_ROTATE, v)) * 10) / 10;
  try {
    const app = await withTimeout(Client.connect(space, { token: hfToken() }), Math.min(30_000, timeoutMs), "connecting");
    const res = await withTimeout(
      app.predict("/edit_expression", {
        image: handle_file(image),
        rotate_pitch: clamp(pose.pitch),
        rotate_yaw: clamp(pose.yaw),
        rotate_roll: 0,
        blink: 0,
        eyebrow: 0,
        wink: 0,
        pupil_x: 0,
        pupil_y: 0,
        aaa: 0,
        eee: 0,
        woo: 0,
        smile: 0,
        src_ratio: 1,
        sample_ratio: 1,
        // Only the head turns: the expression stays the photo's own.
        sample_parts: "OnlyRotation",
        crop_factor: 1.7,
      }),
      timeoutMs,
      "generation",
    );
    const out = (res.data as { url?: string }[] | undefined)?.[0]?.url;
    if (!out) throw new Error("the Space returned no image");
    const file = await fetch(out, { headers: hfToken() ? { Authorization: `Bearer ${hfToken()}` } : {} });
    if (!file.ok) throw new Error(`couldn't download the result (${file.status})`);
    const blob = await file.blob();
    return blob.type.startsWith("image/") ? blob : new Blob([blob], { type: "image/webp" });
  } catch (err) {
    throw err instanceof SpaceError ? err : classify(err, space);
  }
}
