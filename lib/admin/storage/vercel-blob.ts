import "server-only";
import { del, list } from "@vercel/blob";
import { isBlobUrl, type StoreUsage } from "./contract";
import { StorageError } from "./types";

/**
 * The pre-Sprint-12 Vercel Blob store, kept for legacy media and small assets.
 * Server-only: the SDK reads BLOB_READ_WRITE_TOKEN from process.env.
 */

/** Hobby plan storage quota. */
export const BLOB_QUOTA_BYTES = 1024 * 1024 * 1024;

/** list() returns ≤ 1000 blobs a page; 20 pages stops a runaway loop. */
const MAX_PAGES = 20;

export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Totals for the whole store. Failures come back in `error` rather than throwing. */
export async function blobUsage(): Promise<StoreUsage & { quotaBytes: number }> {
  const usage = { configured: isBlobConfigured(), bytes: 0, count: 0, videos: 0, quotaBytes: BLOB_QUOTA_BYTES };
  if (!usage.configured) return usage;
  try {
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await list({ cursor, limit: 1000 });
      for (const b of res.blobs) {
        usage.count++;
        usage.bytes += b.size;
        if (b.pathname.startsWith("videos/")) usage.videos++;
      }
      if (!res.hasMore || !res.cursor) break;
      cursor = res.cursor;
    }
    return usage;
  } catch (err) {
    return { ...usage, error: `Couldn't read Vercel Blob usage${err instanceof Error ? `: ${err.message}` : ""}` };
  }
}

/** Deletes one blob. Only URLs from this store are accepted. */
export async function deleteBlobUrl(url: string): Promise<void> {
  if (!isBlobConfigured()) throw new StorageError("Vercel Blob isn't configured (BLOB_READ_WRITE_TOKEN)", 503);
  if (!isBlobUrl(url)) throw new StorageError("That isn't a Vercel Blob URL", 400);
  try {
    await del(url);
  } catch (err) {
    throw new StorageError(`Vercel Blob couldn't delete the file${err instanceof Error ? `: ${err.message}` : ""}`, 502);
  }
}
