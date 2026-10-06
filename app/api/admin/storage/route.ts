import { isAuthorized, unauthorized } from "@/lib/admin/auth";
import { errorResponse } from "@/lib/admin/projects-file";
import { b2Config, getBucketUsage, isB2Configured } from "@/lib/admin/storage/b2";
import { type StorageStatusResponse } from "@/lib/admin/storage/contract";
import { committedSetting, publicBase, resolveProvider } from "@/lib/admin/storage/index";
import { blobUsage, isBlobConfigured } from "@/lib/admin/storage/vercel-blob";

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
    const b2On = isB2Configured();
    const cfg = b2On ? b2Config() : null;
    const blobOn = isBlobConfigured();

    const [b2Res, blobRes] = await Promise.allSettled([
      b2On ? getBucketUsage() : Promise.resolve(null),
      blobUsage(),
    ]);

    const empty = { bytes: 0, count: 0, videos: 0 };
    const b2: StorageStatusResponse["b2"] = {
      configured: b2On,
      ...empty,
      bucket: cfg?.bucket ?? "",
      endpoint: hostOf(cfg?.endpoint),
      publicBase: publicBase(),
    };
    if (b2Res.status === "fulfilled" && b2Res.value) {
      b2.bytes = b2Res.value.bytes;
      b2.count = b2Res.value.count;
      b2.videos = b2Res.value.videos;
    } else if (b2Res.status === "rejected") {
      b2.error = reason(b2Res);
    }

    const blob: StorageStatusResponse["blob"] =
      blobRes.status === "fulfilled"
        ? blobRes.value
        : { configured: blobOn, ...empty, quotaBytes: 0, error: reason(blobRes) };

    const body: StorageStatusResponse = { provider: resolveProvider(setting), setting, b2, blob };
    return Response.json(body);
  } catch (err) {
    return errorResponse(err);
  }
}
