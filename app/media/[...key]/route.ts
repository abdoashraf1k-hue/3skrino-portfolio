import { getPresignedGetUrl, isB2Configured } from "@/lib/admin/storage/b2";
import { KEY_PATTERN } from "@/lib/admin/storage/contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public delivery route: /media/<key> → 302 to a 15-minute presigned GET on
 * the bucket (which can stay private). Bytes never pass through this function
 * (Vercel's 4.5 MB body / bandwidth limits) — the browser follows the redirect
 * and range-requests the bucket directly.
 */

const URL_TTL_SECONDS = 900;

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

async function redirect(params: Promise<{ key: string[] }>): Promise<Response> {
  const { key: segments } = await params;
  let key: string;
  try {
    key = segments.map((s) => decodeURIComponent(s)).join("/");
  } catch {
    return notFound();
  }
  if (!KEY_PATTERN.test(key) || !isB2Configured()) return notFound();
  try {
    const url = await getPresignedGetUrl(key, URL_TTL_SECONDS);
    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        // The URL is signed at the start of a 5-min window and lives 15 min, so
        // it has ≥ 10 min left when handed out; caching the redirect for 5 min
        // never points at an expired URL.
        "Cache-Control": "private, max-age=300",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return new Response("Media unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  return redirect(params);
}

export async function HEAD(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  return redirect(params);
}
