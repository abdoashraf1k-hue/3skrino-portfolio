/**
 * Sprint 12 — server-side storage types. The wire shapes live in ./contract;
 * this file holds what the providers share among themselves: the generic
 * object-store interface and the error every storage failure is mapped to.
 */

/** A storage failure with the HTTP status the admin API should answer with. */
export class StorageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

export type CompletedPart = { partNumber: number; etag: string };

export type ObjectInfo = { size: number; contentType: string };

export type ListedObject = { key: string; size: number; lastModified: string };

export type BucketUsage = { bytes: number; count: number; videos: number };

/** One S3-compatible bucket. Every URL it hands out is presigned and short-lived. */
export type ObjectStore = {
  /** Single-request upload; Content-Type and Content-Length are part of the signature. */
  presignPut(key: string, contentType: string, contentLength: number): Promise<string>;
  /** Starts a multipart upload and returns its uploadId. */
  createMultipart(key: string, contentType: string): Promise<string>;
  presignPart(key: string, uploadId: string, partNumber: number): Promise<string>;
  completeMultipart(key: string, uploadId: string, parts: CompletedPart[]): Promise<void>;
  abortMultipart(key: string, uploadId: string): Promise<void>;
  /** Size and type of an object, or null when it doesn't exist. */
  head(key: string): Promise<ObjectInfo | null>;
  presignGet(key: string, ttlSeconds?: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
  list(prefix: string): Promise<ListedObject[]>;
  usage(): Promise<BucketUsage>;
};
