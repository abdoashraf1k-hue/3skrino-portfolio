import { isAuthorized, unauthorized } from "@/lib/admin/auth";
import { errorResponse, readJson } from "@/lib/admin/projects-file";
import { activeBucket, getBucketUsage, HOST_LABEL } from "@/lib/admin/storage/bucket";
import { applyCors, testConnection } from "@/lib/admin/storage/conntest";
import { type StorageStatusResponse } from "@/lib/admin/storage/contract";
import { StorageError } from "@/lib/admin/storage/types";
import { committedSetting, publicBase, resolveProvider } from "@/lib/admin/storage/index";
import { blobUsage, isBlobConfigured } from "@/lib/admin/storage/vercel-blob";
import type { TigrisCredentials } from "@/lib/storage/tigris";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Host only — never a full URL with credentials or a path. */
function hostOf(endpoint: string | undefined): string {
  if (!endpoint) return "";
  try {
    return new URL(endpoint).host;
  } catch {
    return "";
  }
}

function reason(r: PromiseRejectedResult): string {
  return r.reason instanceof Error && r.reason.message ? r.reason.message : "Couldn't read usage";
}

/** GET → the Settings → Storage panel: active provider + usage of both stores. */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const setting = committedSetting();
    const active = activeBucket();
    const blobOn = isBlobConfigured();

    const [bucketRes, blobRes] = await Promise.allSettled([active ? getBucketUsage() : Promise.resolve(null), blobUsage()]);

    const empty = { bytes: 0, count: 0, videos: 0 };
    // "b2" in the wire shape = the S3 media bucket (Tigris, or B2 as the fallback).
    const b2: StorageStatusResponse["b2"] = {
      configured: Boolean(active),
      ...empty,
      host: active?.host ?? "none",
      hostLabel: active ? HOST_LABEL[active.host] : "",
      bucket: active?.config.bucket ?? "",
      endpoint: hostOf(active?.config.endpoint),
      publicBase: publicBase(),
    };
    if (bucketRes.status === "fulfilled" && bucketRes.value) {
      b2.bytes = bucketRes.value.bytes;
      b2.count = bucketRes.value.count;
      b2.videos = bucketRes.value.videos;
    } else if (bucketRes.status === "rejected") {
      b2.error = reason(bucketRes);
    }

    const blob: StorageStatusResponse["blob"] =
      blobRes.status === "fulfilled" ? blobRes.value : { configured: blobOn, ...empty, quotaBytes: 0, error: reason(blobRes) };

    const body: StorageStatusResponse = { provider: resolveProvider(setting), setting, b2, blob };
    return Response.json(body);
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Sprint 15.5 — POST { action: "test" | "cors", credentials? } → Tigris
 * connection test / apply the site's CORS rule. Pasted credentials are used
 * for this request only: never stored, logged or returned.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const body = await readJson(request);
    const raw = (body.credentials ?? undefined) as Record<string, unknown> | undefined;
    const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 500) : "");
    const credentials: Partial<TigrisCredentials> | undefined = raw
      ? { endpoint: str(raw.endpoint), region: str(raw.region), accessKeyId: str(raw.accessKeyId), secretAccessKey: str(raw.secretAccessKey), bucket: str(raw.bucket) }
      : undefined;
    const origin = request.headers.get("origin");
    if (body.action === "test") return Response.json(await testConnection(credentials, origin));
    if (body.action === "cors") return Response.json({ ok: true, ...(await applyCors(credentials, origin)) });
    return Response.json({ ok: false, error: 'action must be "test" or "cors"' }, { status: 400 });
  } catch (err) {
    // Storage failures carry a readable reason (bad key, missing bucket…) — show it, not "Unexpected server error".
    if (err instanceof StorageError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    return errorResponse(err);
  }
}
