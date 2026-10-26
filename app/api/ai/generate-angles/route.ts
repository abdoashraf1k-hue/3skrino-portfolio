import { isAuthorized, unauthorized } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sprint 14 — the AI angle generator (admin only, `Authorization: Bearer <admin key>`).
 *
 * Diffusion can't run on Vercel, so this asks Replicate. The model is a
 * LivePortrait pose editor (fofr/expression-editor by default): it re-renders
 * *your* photo with the head turned, so identity holds far better than a
 * text-prompted generator — but each pass turns the head at most ±20°, so the
 * admin fills gaps outwards from real frames, in hops. The back of the head
 * can't be invented this way; that needs real photos.
 *
 * A prediction takes longer than a serverless request may, so nothing here
 * waits on one:
 *   POST { referenceImageUrl, referenceYaw?, missingAngles, pitch?, gain?, brandId? }
 *        → { jobs: [{ angle, rotateYaw, id }] }  — one prediction per angle
 *   GET  ?id=…          → { status, error, outputs }
 *   GET  ?id=…&file=0   → the generated image's bytes (proxied: no CORS, no
 *                         Replicate URL reaches the browser), for the admin to
 *                         run the detector on and upload to B2.
 */

const API = "https://api.replicate.com/v1";
/** fofr/expression-editor — inputs image, rotate_yaw / rotate_pitch / rotate_roll (−20…20). Override with REPLICATE_ANGLE_VERSION. */
const DEFAULT_VERSION = "bf913bc90e1c44ba288ba3942a538693b72e8cc7df576f3beebe56adc0a92b86";
/** The model's rotation limit, per pass. */
const MAX_ROTATE = 20;
const MAX_JOBS = 12;
const ID = /^[a-z0-9]{8,64}$/;
const OUTPUT_HOST = /(^|\.)replicate\.delivery$/;

const bad = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

function token(): string | null {
  return process.env.REPLICATE_API_TOKEN?.trim() || null;
}

async function replicate(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clampRotate = (v: number) => Math.round(Math.min(MAX_ROTATE, Math.max(-MAX_ROTATE, v)) * 10) / 10;
/** Shortest signed distance a → b in degrees. */
const delta = (a: number, b: number) => ((((b - a + 180) % 360) + 360) % 360) - 180;

/** Replicate fetches the reference itself: a /path becomes an absolute URL on the public site. */
function absolute(url: string, request: Request): string | null {
  if (/^https:\/\/\S+$/.test(url)) return url;
  if (!/^\/(?!\/)(?!.*\.\.)[\w\-./%]+$/.test(url)) return null;
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") || new URL(request.url).origin;
  return `${origin}${url}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  if (!token()) return bad("REPLICATE_API_TOKEN isn't set — add it in Vercel → Settings → Environment Variables (see .env.example)", 503);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return bad("Body must be a JSON object");
    body = parsed as Record<string, unknown>;
  } catch {
    return bad("Body must be JSON");
  }

  const ref = typeof body.referenceImageUrl === "string" ? absolute(body.referenceImageUrl.trim(), request) : null;
  if (!ref) return bad('"referenceImageUrl" must be an https URL or a /path on this site');
  const angles = body.missingAngles;
  if (!Array.isArray(angles) || !angles.length || !angles.every(finite)) return bad('"missingAngles" must be a non-empty list of yaw angles (degrees)');
  if (angles.length > MAX_JOBS) return bad(`At most ${MAX_JOBS} angles per request`);
  const refYaw = finite(body.referenceYaw) ? body.referenceYaw : 0;
  const pitch = finite(body.pitch) ? clampRotate(body.pitch) : 0;
  // Model units per degree of detected turn, measured by the admin on earlier results (sign included).
  const gain = finite(body.gain) && Math.abs(body.gain) >= 0.2 && Math.abs(body.gain) <= 5 ? body.gain : 1;
  const brandId = typeof body.brandId === "string" ? body.brandId.slice(0, 60) : undefined;
  const version = process.env.REPLICATE_ANGLE_VERSION?.trim() || DEFAULT_VERSION;

  try {
    const jobs = await Promise.all(
      angles.map(async (angle) => {
        const rotateYaw = clampRotate(delta(refYaw, angle) * gain);
        const res = await replicate("/predictions", {
          method: "POST",
          body: JSON.stringify({
            version,
            input: { image: ref, rotate_yaw: rotateYaw, rotate_pitch: pitch, rotate_roll: 0, output_format: "webp", output_quality: 95 },
          }),
        });
        const data = (await res.json().catch(() => null)) as { id?: string; detail?: string } | null;
        if (!res.ok || !data?.id) throw new Error(data?.detail ?? `Replicate refused the job (${res.status})`);
        return { angle, rotateYaw, id: data.id };
      }),
    );
    return Response.json({ ok: true, jobs, ...(brandId ? { brandId } : {}) });
  } catch (err) {
    return bad(err instanceof Error ? err.message : "Replicate request failed", 502);
  }
}

type Prediction = { status: string; error?: string | null; output?: unknown };

export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  if (!token()) return bad("REPLICATE_API_TOKEN isn't set", 503);
  const params = new URL(request.url).searchParams;
  const id = params.get("id") ?? "";
  if (!ID.test(id)) return bad("Bad prediction id");

  const res = await replicate(`/predictions/${id}`);
  if (!res.ok) return bad(`Replicate: prediction ${id} not found (${res.status})`, 502);
  const p = (await res.json()) as Prediction;
  const outputs = (Array.isArray(p.output) ? p.output : p.output ? [p.output] : []).filter((u): u is string => typeof u === "string");

  const file = params.get("file");
  if (file === null) return Response.json({ ok: true, status: p.status, error: p.error ?? null, outputs: outputs.length });

  // Proxy one output, only from Replicate's own delivery host.
  const src = outputs[Number(file)];
  if (p.status !== "succeeded" || !src) return bad("No such output yet", 404);
  const url = new URL(src);
  if (url.protocol !== "https:" || !OUTPUT_HOST.test(url.hostname)) return bad("Unexpected output host", 502);
  const img = await fetch(url, { cache: "no-store" });
  if (!img.ok || !img.body) return bad(`Couldn't fetch the output (${img.status})`, 502);
  return new Response(img.body, {
    headers: { "Content-Type": img.headers.get("content-type") ?? "image/webp", "Cache-Control": "no-store" },
  });
}
