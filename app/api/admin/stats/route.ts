import { list } from "@vercel/blob";
import { isAuthorized, unauthorized } from "@/lib/admin/auth";
import { lastCommitDate } from "@/lib/admin/github";
import { PROJECTS_PATH } from "@/lib/admin/projects-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAYS = 14;
const MAX_PAGES = 20; // 20k blobs — far beyond a portfolio; stops a runaway loop

export type BlobStats = {
  configured: boolean;
  count: number;
  videos: number;
  videoBytes: number;
  images: number;
  bytes: number;
  /** Uploads per day, oldest → today (length DAYS). */
  uploadsByDay: number[];
};

export type StatsResponse = { blob: BlobStats; lastEdit: string | null };

async function blobStats(): Promise<BlobStats> {
  const empty: BlobStats = { configured: false, count: 0, videos: 0, videoBytes: 0, images: 0, bytes: 0, uploadsByDay: Array(DAYS).fill(0) };
  if (!process.env.BLOB_READ_WRITE_TOKEN) return empty;

  const stats = { ...empty, configured: true, uploadsByDay: Array<number>(DAYS).fill(0) };
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await list({ cursor, limit: 1000 });
    for (const b of res.blobs) {
      stats.count++;
      stats.bytes += b.size;
      if (b.pathname.startsWith("videos/")) {
        stats.videos++;
        stats.videoBytes += b.size;
      } else if (b.pathname.startsWith("thumbnails/")) {
        stats.images++;
      }
      const day = Math.floor((today.getTime() - new Date(b.uploadedAt).setUTCHours(0, 0, 0, 0)) / 86_400_000);
      if (day >= 0 && day < DAYS) stats.uploadsByDay[DAYS - 1 - day]++;
    }
    if (!res.hasMore || !res.cursor) break;
    cursor = res.cursor;
  }
  return stats;
}

/** GET → Blob storage usage + the last commit touching the projects file. */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  const [blob, lastEdit] = await Promise.all([
    blobStats().catch(() => null),
    lastCommitDate(PROJECTS_PATH).catch(() => null),
  ]);
  const body: StatsResponse = {
    blob: blob ?? { configured: false, count: 0, videos: 0, videoBytes: 0, images: 0, bytes: 0, uploadsByDay: Array(DAYS).fill(0) },
    lastEdit,
  };
  return Response.json(body);
}
