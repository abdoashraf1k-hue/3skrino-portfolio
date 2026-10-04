import { del, list } from "@vercel/blob";
import { isAuthorized, unauthorized } from "@/lib/admin/auth";
import { ProjectsFileError, errorResponse, readJson } from "@/lib/admin/projects-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The upload folders (see /api/admin/blob-upload). */
const FOLDERS = ["videos", "thumbnails", "hero", "brands", "site", "audio"] as const;

export type MediaItem = { url: string; pathname: string; size: number; uploadedAt: string; folder: string };
export type MediaResponse = { items: MediaItem[]; cursor: string | null; hasMore: boolean };

function configured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** GET ?folder=&cursor=&limit= → one page of the Vercel Blob store, newest first within the page. */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    if (!configured()) throw new ProjectsFileError("Vercel Blob isn't configured (BLOB_READ_WRITE_TOKEN)", 503);
    const q = new URL(request.url).searchParams;
    const folder = q.get("folder") ?? "";
    if (folder && !(FOLDERS as readonly string[]).includes(folder)) throw new ProjectsFileError(`Unknown folder "${folder}"`);
    const limit = Math.min(500, Math.max(1, Number(q.get("limit")) || 200));
    const res = await list({ prefix: folder ? `${folder}/` : undefined, cursor: q.get("cursor") || undefined, limit });
    const items: MediaItem[] = res.blobs
      .map((b) => ({
        url: b.url,
        pathname: b.pathname,
        size: b.size,
        uploadedAt: new Date(b.uploadedAt).toISOString(),
        folder: b.pathname.split("/")[0] ?? "",
      }))
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    const body: MediaResponse = { items, cursor: res.cursor ?? null, hasMore: res.hasMore };
    return Response.json(body);
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE { url } → removes one blob. Only URLs from this store are accepted. */
export async function DELETE(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    if (!configured()) throw new ProjectsFileError("Vercel Blob isn't configured (BLOB_READ_WRITE_TOKEN)", 503);
    const { url } = await readJson(request);
    if (typeof url !== "string" || !/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/\S+$/i.test(url)) {
      throw new ProjectsFileError("That isn't a Vercel Blob URL");
    }
    await del(url);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
