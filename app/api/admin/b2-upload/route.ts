import { isAuthorized, unauthorized } from "@/lib/admin/auth";
import { ProjectsFileError, errorResponse, readJson } from "@/lib/admin/projects-file";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  deleteObject,
  getPresignedMultipartUrl,
  getPresignedPutUrl,
  headObject,
  isB2Configured,
} from "@/lib/admin/storage/b2";
import {
  KEY_PATTERN,
  LIMITS,
  MEDIA_FOLDERS,
  partSizeFor,
  type ConfigResponse,
  type DeleteResponse,
  type FileInfo,
  type MediaFolder,
  type MultipartCompleteResponse,
  type MultipartPartResponse,
  type MultipartStartResponse,
  type OkResponse,
  type PutResponse,
  type UploadRequest,
} from "@/lib/admin/storage/contract";
import {
  assertUpload,
  committedSetting,
  keyFromUrl,
  makeKey,
  publicBase,
  publicUrlFor,
  resolveProvider,
} from "@/lib/admin/storage/index";
import { StorageError } from "@/lib/admin/storage/types";
import { isBlobConfigured } from "@/lib/admin/storage/vercel-blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { action, … } → presigned URLs for direct browser → B2 (S3-compatible)
 * uploads. Credentials stay on the server; the browser only ever sees
 * short-lived signed URLs. Every action needs the admin key.
 */

const NOT_CONFIGURED = "B2 isn't configured — set B2_* env vars (docs/STORAGE.md)";
/**
 * Highest part number a legitimate upload can reach: the largest allowed video
 * at its part size. The server keeps no per-upload state, so this bound (plus
 * the size check after complete) is what stops a part-by-part upload from
 * outgrowing LIMITS.maxVideoBytes.
 */
const MAX_PART_NUMBER = Math.ceil(LIMITS.maxVideoBytes / partSizeFor(LIMITS.maxVideoBytes));

/* ------------------------------------------------------------------ */
/* Strict body validation                                              */
/* ------------------------------------------------------------------ */

function bad(message: string): never {
  throw new ProjectsFileError(message, 400);
}

function onlyFields(body: Record<string, unknown>, allowed: readonly string[]) {
  for (const k of Object.keys(body)) {
    if (k !== "action" && !allowed.includes(k)) bad(`Unknown field "${k}"`);
  }
}

function str(body: Record<string, unknown>, field: string, max: number): string {
  const v = body[field];
  if (typeof v !== "string" || !v.trim()) bad(`"${field}" must be a non-empty string`);
  if (v.length > max) bad(`"${field}" is too long`);
  return v;
}

function positiveInt(v: unknown, field: string, max: number): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 1 || v > max) bad(`"${field}" must be an integer 1–${max}`);
  return v;
}

function fileInfo(body: Record<string, unknown>): FileInfo {
  return {
    filename: str(body, "filename", 255),
    contentType: str(body, "contentType", 100),
    size: positiveInt(body.size, "size", Number.MAX_SAFE_INTEGER),
  };
}

function folderOf(body: Record<string, unknown>): MediaFolder {
  const f = body.folder;
  const found = MEDIA_FOLDERS.find((m) => m === f);
  if (!found) bad(`"folder" must be one of ${MEDIA_FOLDERS.join(", ")}`);
  return found;
}

/** A key the browser sends back: server-minted shape, inside videos/. */
function videoKey(body: Record<string, unknown>): string {
  const key = str(body, "key", 200);
  if (!KEY_PATTERN.test(key) || !key.startsWith("videos/")) bad("Invalid key");
  return key;
}

function parseRequest(body: Record<string, unknown>): UploadRequest {
  switch (body.action) {
    case "config":
      onlyFields(body, []);
      return { action: "config" };
    case "put":
      onlyFields(body, ["folder", "filename", "contentType", "size"]);
      return { action: "put", folder: folderOf(body), ...fileInfo(body) };
    case "multipart-start": {
      onlyFields(body, ["folder", "filename", "contentType", "size"]);
      if (body.folder !== "videos") bad('Multipart uploads go to the "videos" folder only');
      return { action: "multipart-start", folder: "videos", ...fileInfo(body) };
    }
    case "multipart-part": {
      onlyFields(body, ["key", "uploadId", "partNumbers"]);
      const key = videoKey(body);
      const uploadId = str(body, "uploadId", 1024);
      const raw = body.partNumbers;
      if (!Array.isArray(raw) || raw.length === 0) bad('"partNumbers" must be a non-empty array');
      if (raw.length > LIMITS.signBatch * 2) bad(`At most ${LIMITS.signBatch * 2} part numbers per call`);
      const partNumbers = [...new Set(raw.map((n: unknown) => positiveInt(n, "partNumbers[]", MAX_PART_NUMBER)))];
      return { action: "multipart-part", key, uploadId, partNumbers };
    }
    case "multipart-complete": {
      onlyFields(body, ["key", "uploadId", "parts"]);
      const key = videoKey(body);
      const uploadId = str(body, "uploadId", 1024);
      const raw = body.parts;
      if (!Array.isArray(raw) || raw.length === 0) bad('"parts" must be a non-empty array');
      if (raw.length > MAX_PART_NUMBER) bad("Too many parts");
      const parts = raw.map((p: unknown) => {
        if (typeof p !== "object" || p === null || Array.isArray(p)) bad("Each part must be { partNumber, etag }");
        const rec = p as Record<string, unknown>;
        for (const k of Object.keys(rec)) if (k !== "partNumber" && k !== "etag") bad(`Unknown part field "${k}"`);
        return { partNumber: positiveInt(rec.partNumber, "partNumber", MAX_PART_NUMBER), etag: str(rec, "etag", 200) };
      });
      parts.sort((a, b) => a.partNumber - b.partNumber);
      for (let i = 1; i < parts.length; i++) {
        if (parts[i].partNumber === parts[i - 1].partNumber) bad(`Duplicate part ${parts[i].partNumber}`);
      }
      return { action: "multipart-complete", key, uploadId, parts };
    }
    case "multipart-abort":
      onlyFields(body, ["key", "uploadId"]);
      return { action: "multipart-abort", key: videoKey(body), uploadId: str(body, "uploadId", 1024) };
    case "delete":
      onlyFields(body, ["url"]);
      return { action: "delete", url: str(body, "url", 2048) };
    default:
      return bad("Unknown action");
  }
}

async function presignBatch(key: string, uploadId: string, partNumbers: number[]): Promise<Record<number, string>> {
  const signed = await Promise.all(partNumbers.map((n) => getPresignedMultipartUrl(key, uploadId, n)));
  const urls: Record<number, string> = {};
  partNumbers.forEach((n, i) => (urls[n] = signed[i]));
  return urls;
}

function isMissingUpload(err: unknown): boolean {
  if (err instanceof StorageError && err.status === 404) return true;
  return err instanceof Error && (err.name === "NoSuchUpload" || /NoSuchUpload/.test(err.message));
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

async function handle(req: UploadRequest): Promise<Response> {
  if (req.action === "config") {
    const setting = committedSetting();
    const body: ConfigResponse = {
      provider: resolveProvider(setting),
      setting,
      configured: { b2: isB2Configured(), blob: isBlobConfigured() },
      publicBase: publicBase(),
    };
    return Response.json(body);
  }

  if (!isB2Configured()) return Response.json({ error: NOT_CONFIGURED }, { status: 503 });

  switch (req.action) {
    case "put": {
      assertUpload(req.folder, req.contentType, req.size);
      const key = makeKey(req.folder, req.filename);
      const url = await getPresignedPutUrl(key, req.contentType, req.size);
      const body: PutResponse = {
        key,
        url,
        headers: { "Content-Type": req.contentType },
        publicUrl: publicUrlFor(key),
        expiresIn: LIMITS.presignTtlSeconds,
      };
      return Response.json(body);
    }
    case "multipart-start": {
      assertUpload(req.folder, req.contentType, req.size);
      if (req.size < LIMITS.multipartThreshold) bad("File is small enough for a single PUT");
      const partSize = partSizeFor(req.size);
      const partCount = Math.ceil(req.size / partSize);
      if (partCount > LIMITS.maxParts) bad("File needs too many parts");
      const key = makeKey(req.folder, req.filename);
      const uploadId = await createMultipartUpload(key, req.contentType);
      const first = Array.from({ length: Math.min(LIMITS.signBatch, partCount) }, (_, i) => i + 1);
      const body: MultipartStartResponse = {
        key,
        uploadId,
        partSize,
        partCount,
        urls: await presignBatch(key, uploadId, first),
        publicUrl: publicUrlFor(key),
        expiresIn: LIMITS.presignTtlSeconds,
      };
      return Response.json(body);
    }
    case "multipart-part": {
      const body: MultipartPartResponse = {
        urls: await presignBatch(req.key, req.uploadId, req.partNumbers),
        expiresIn: LIMITS.presignTtlSeconds,
      };
      return Response.json(body);
    }
    case "multipart-complete": {
      try {
        await completeMultipartUpload(req.key, req.uploadId, req.parts);
      } catch (err) {
        // A retried complete whose first attempt went through: the upload id is
        // gone but the object exists — that's success, not an error.
        if (!isMissingUpload(err) || !(await headObject(req.key))) throw err;
      }
      const head = await headObject(req.key);
      if (!head) return Response.json({ error: "Upload completed but the object can't be found" }, { status: 502 });
      if (head.size > LIMITS.maxVideoBytes) {
        await deleteObject(req.key).catch(() => {});
        bad(`The uploaded file is larger than the ${LIMITS.maxVideoBytes / 1024 ** 3} GB limit — it was removed`);
      }
      const body: MultipartCompleteResponse = { publicUrl: publicUrlFor(req.key), size: head.size };
      return Response.json(body);
    }
    case "multipart-abort": {
      try {
        await abortMultipartUpload(req.key, req.uploadId);
      } catch (err) {
        if (!isMissingUpload(err)) throw err;
      }
      const body: OkResponse = { ok: true };
      return Response.json(body);
    }
    case "delete": {
      const key = keyFromUrl(req.url);
      if (!key) bad("Not a URL from this store");
      await deleteObject(key);
      const body: DeleteResponse = { ok: true, deleted: true };
      return Response.json(body);
    }
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorized(request)) return unauthorized();
  try {
    return await handle(parseRequest(await readJson(request)));
  } catch (err) {
    if (err instanceof StorageError) return Response.json({ error: err.message }, { status: err.status });
    return errorResponse(err);
  }
}
