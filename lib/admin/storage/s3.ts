import "server-only";
import { createHash } from "node:crypto";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { LIMITS } from "./contract";
import { StorageError, type CompletedPart, type ListedObject, type ObjectStore } from "./types";

/**
 * A generic S3-compatible bucket (Backblaze B2, Cloudflare R2, AWS S3…).
 * Server-only: holds the credentials and mints short-lived presigned URLs so
 * the browser can move bytes straight to the bucket. Never logs secrets.
 */

export type S3Config = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Defaults to true — path-style URLs work on every S3-compatible host. */
  forcePathStyle?: boolean;
};

/** ListObjectsV2 returns ≤ 1000 keys a page; 20 pages stops a runaway loop. */
const MAX_LIST_PAGES = 20;

/** Query params that mean the SDK signed a checksum into the URL (breaks B2/R2). */
const CHECKSUM_PARAM = /[?&]x-amz-(sdk-)?checksum/i;

/**
 * GETs are signed at the start of a 5-minute window, so every /media hit in
 * that window redirects to the SAME URL and the browser's HTTP cache can serve
 * repeat views (each fresh signature would be a new cache key → a re-download
 * against B2's daily download cap). URLs still expire ≤ 15 min after signing,
 * i.e. at least 10 min after they're handed out.
 */
export const GET_SIGN_WINDOW_SECONDS = 300;

/** Keys are never reused (timestamp + random), so the bytes can be cached for good. */
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

const clients = new Map<string, S3Client>();

/** One S3Client per distinct config, reused across requests in the same instance. */
function clientFor(cfg: S3Config): S3Client {
  // Hash the config so the secret never sits in a Map key in plain text.
  const id = createHash("sha256").update(JSON.stringify(cfg)).digest("hex");
  let client = clients.get(id);
  if (!client) {
    client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      forcePathStyle: cfg.forcePathStyle ?? true,
      // Since SDK v3.729 the default signs a CRC32 of an EMPTY body into
      // presigned URLs; B2 and R2 then answer SignatureDoesNotMatch.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    clients.set(id, client);
  }
  return client;
}

/** Fails loudly if a checksum slipped into a presigned URL despite the client settings. */
function assertNoChecksum(url: string): string {
  if (CHECKSUM_PARAM.test(url)) {
    throw new StorageError(
      "The presigned URL carries an x-amz-checksum parameter, which S3-compatible hosts reject — check the S3 client checksum settings",
      500,
    );
  }
  return url;
}

/** Presign TTLs never exceed the contract's 15 minutes. */
function ttl(seconds: number = LIMITS.presignTtlSeconds): number {
  return Math.min(LIMITS.presignTtlSeconds, Math.max(1, Math.floor(seconds)));
}

function isNotFound(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return err.name === "NotFound" || err.name === "NoSuchKey" || status === 404;
}

export function createS3Store(cfg: S3Config): ObjectStore {
  const client = clientFor(cfg);
  const Bucket = cfg.bucket;

  async function list(prefix: string): Promise<ListedObject[]> {
    const objects: ListedObject[] = [];
    let token: string | undefined;
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const res = await client.send(
        new ListObjectsV2Command({ Bucket, Prefix: prefix || undefined, ContinuationToken: token }),
      );
      for (const o of res.Contents ?? []) {
        if (!o.Key) continue;
        objects.push({ key: o.Key, size: o.Size ?? 0, lastModified: (o.LastModified ?? new Date(0)).toISOString() });
      }
      if (!res.IsTruncated || !res.NextContinuationToken) break;
      token = res.NextContinuationToken;
    }
    return objects;
  }

  return {
    async presignPut(key, contentType, contentLength) {
      const command = new PutObjectCommand({ Bucket, Key: key, ContentType: contentType, ContentLength: contentLength });
      const url = await getSignedUrl(client, command, {
        expiresIn: ttl(),
        // The presigner leaves content-type unsigned by default; sign both so
        // the bucket rejects a PUT with a different type or size.
        signableHeaders: new Set(["content-type", "content-length"]),
      });
      return assertNoChecksum(url);
    },

    async createMultipart(key, contentType) {
      const res = await client.send(
        new CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: contentType, CacheControl: IMMUTABLE_CACHE }),
      );
      if (!res.UploadId) throw new StorageError("The bucket didn't return an upload id", 502);
      return res.UploadId;
    },

    async presignPart(key, uploadId, partNumber) {
      const command = new UploadPartCommand({ Bucket, Key: key, UploadId: uploadId, PartNumber: partNumber });
      return assertNoChecksum(await getSignedUrl(client, command, { expiresIn: ttl() }));
    },

    async completeMultipart(key, uploadId, parts: CompletedPart[]) {
      // S3 requires ascending part numbers; ETags are sent back verbatim (quotes included).
      const Parts = [...parts]
        .sort((a, b) => a.partNumber - b.partNumber)
        .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag }));
      await client.send(new CompleteMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts } }));
    },

    async abortMultipart(key, uploadId) {
      await client.send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId }));
    },

    async head(key) {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? "application/octet-stream" };
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async presignGet(key, ttlSeconds) {
      const command = new GetObjectCommand({ Bucket, Key: key });
      const windowMs = GET_SIGN_WINDOW_SECONDS * 1000;
      const signingDate = new Date(Math.floor(Date.now() / windowMs) * windowMs);
      return assertNoChecksum(await getSignedUrl(client, command, { expiresIn: ttl(ttlSeconds), signingDate }));
    },

    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },

    list,

    async usage() {
      const objects = await list("");
      return {
        bytes: objects.reduce((sum, o) => sum + o.size, 0),
        count: objects.length,
        videos: objects.filter((o) => o.key.startsWith("videos/")).length,
      };
    },
  };
}
