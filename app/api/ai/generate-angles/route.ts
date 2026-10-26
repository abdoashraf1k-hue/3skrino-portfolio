import { isAuthorized, unauthorized } from "@/lib/admin/auth";
import { editOnSpace, MAX_ROTATE, planA, planB, SpaceError, type SpaceErrorCode } from "@/lib/ai/liveportrait";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A CPU fallback can take minutes; one request generates one angle.
export const maxDuration = 300;

/**
 * Sprint 14b — the free AI angle generator (admin only, `Authorization: Bearer <admin key>`).
 *
 * POST multipart/form-data:
 *   image          the reference frame (the admin sends the bytes — the server never fetches URLs)
 *   referenceYaw   its detected yaw, degrees
 *   targetYaw      the yaw wanted, degrees (within ±20° of the reference: one pass)
 *   pitch?         degrees, default 0
 *   gain?          model units per degree of detected turn, measured on earlier results
 *
 * → 200 { success: true, planUsed: "A" | "B", space, rotateYaw, imageUrl: data:…, attempts }
 * → 503 { success: false, error, code, attempts } when every free Space failed.
 *
 * Plan A is the ZeroGPU Space; if it fails (quota, queue, asleep) Plan B tries
 * the CPU copies in order — automatically, in this same request.
 */

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // under Vercel's 4.5 MB request body limit
const BUDGET_MS = 280_000;
const PLAN_A_TIMEOUT = 60_000;
const PLAN_B_TIMEOUT = 150_000;

const BUSY_MESSAGE = "Free AI queue is busy or quota exceeded. Please wait a few minutes and try again, or upload the photo manually.";

type Attempt = { plan: "A" | "B"; space: string; ok: boolean; ms: number; error?: string; code?: SpaceErrorCode };

const bad = (error: string, status = 400) => Response.json({ success: false, error }, { status });
const num = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
/** Shortest signed distance a → b in degrees. */
const delta = (a: number, b: number) => ((((b - a + 180) % 360) + 360) % 360) - 180;

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("Send multipart/form-data with the reference image");
  }
  const image = form.get("image");
  if (!(image instanceof Blob) || !image.size) return bad('"image" must be the reference image file');
  if (image.size > MAX_IMAGE_BYTES) return bad("The reference image is over 4 MB");
  if (!/^image\/(png|jpeg|webp)$/.test(image.type)) return bad("The reference image must be a PNG, JPEG or WebP");
  const referenceYaw = num(form.get("referenceYaw")) ?? 0;
  const targetYaw = num(form.get("targetYaw"));
  if (targetYaw === null) return bad('"targetYaw" must be a number (degrees)');
  const pitch = num(form.get("pitch")) ?? 0;
  const g = num(form.get("gain"));
  const gain = g !== null && Math.abs(g) >= 0.2 && Math.abs(g) <= 5 ? g : 1;
  const rotateYaw = Math.round(Math.min(MAX_ROTATE, Math.max(-MAX_ROTATE, delta(referenceYaw, targetYaw) * gain)) * 10) / 10;

  const started = Date.now();
  const attempts: Attempt[] = [];
  const plans: ["A" | "B", string, number][] = [...planA().map((s) => ["A", s, PLAN_A_TIMEOUT] as ["A", string, number]), ...planB().map((s) => ["B", s, PLAN_B_TIMEOUT] as ["B", string, number])];

  for (const [plan, space, timeout] of plans) {
    const left = BUDGET_MS - (Date.now() - started);
    if (left < 15_000) break;
    const t = Date.now();
    try {
      const out = await editOnSpace(space, image, { yaw: rotateYaw, pitch }, Math.min(timeout, left));
      attempts.push({ plan, space, ok: true, ms: Date.now() - t });
      const imageUrl = `data:${out.type};base64,${Buffer.from(await out.arrayBuffer()).toString("base64")}`;
      return Response.json({ success: true, planUsed: plan, space, rotateYaw, imageUrl, attempts });
    } catch (err) {
      const e = err instanceof SpaceError ? err : new SpaceError(err instanceof Error ? err.message : "failed", "failed", space);
      attempts.push({ plan, space, ok: false, ms: Date.now() - t, error: e.message, code: e.code });
    }
  }

  const code: SpaceErrorCode = attempts.some((a) => a.code === "quota") ? "quota" : attempts.some((a) => a.code === "busy") ? "busy" : attempts.every((a) => a.code === "down") ? "down" : "failed";
  return Response.json({ success: false, error: BUSY_MESSAGE, code, attempts }, { status: 503 });
}
