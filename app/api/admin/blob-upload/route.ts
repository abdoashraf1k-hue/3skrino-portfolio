import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isAuthorized, unauthorized } from "@/lib/admin/auth";

export const runtime = "nodejs";

const ROUTE = "/api/admin/blob-upload";

/**
 * Mints short-lived client tokens for direct browser → Vercel Blob uploads.
 * The client gets the blob URL straight back from upload(), so there's no
 * completion handler. A completion webhook is only registered when
 * VERCEL_BLOB_CALLBACK_URL (a base origin, e.g. https://3skrino.com) is set;
 * locally it's absent and no callback is attempted.
 */
export async function POST(request: Request): Promise<Response> {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }
  // Token requests must carry the admin key; a (signed) completion webhook can't.
  if (body.type === "blob.generate-client-token" && !isAuthorized(request)) return unauthorized();

  const callbackBase = process.env.VERCEL_BLOB_CALLBACK_URL?.replace(/\/+$/, "");

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const folder = /^(videos|thumbnails|hero|brands)\/[\w.-]+$/.exec(pathname)?.[1];
        if (!folder) throw new Error("Invalid upload path");
        // Hero poses + brand logos are images only (logos may be SVG), and small.
        const heroAsset = folder === "hero" || folder === "brands";
        return {
          allowedContentTypes: heroAsset
            ? ["image/png", "image/webp", "image/jpeg", ...(folder === "brands" ? ["image/svg+xml"] : [])]
            : ["video/mp4", "video/webm", "video/quicktime", "image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: heroAsset ? 15 * 1024 * 1024 : 2 * 1024 * 1024 * 1024, // 15 MB / 2 GB
          addRandomSuffix: false,
          callbackUrl: callbackBase ? `${callbackBase}${ROUTE}` : undefined,
        };
      },
    });
    return Response.json(jsonResponse);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 });
  }
}
