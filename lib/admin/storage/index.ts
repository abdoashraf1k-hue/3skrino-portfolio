import "server-only";
import { randomInt } from "node:crypto";
import { siteConfig } from "@/data/site-config";
import {
  ALLOWED_TYPES,
  KEY_PATTERN,
  LIMITS,
  MEDIA_ROUTE,
  PROVIDER_SETTINGS,
  keyFromPublicUrl,
  type MediaFolder,
  type ProviderSetting,
  type VideoProvider,
} from "./contract";
import { isB2Configured } from "./b2";
import { StorageError } from "./types";

/**
 * Sprint 12 — the storage façade the admin routes use: which provider new
 * videos go to, how object keys are minted, and how public URLs map back to
 * keys. Server-only.
 */

export * from "./contract";
export * from "./types";
export { isB2Configured } from "./b2";
export { isBlobConfigured } from "./vercel-blob";

const DEFAULT_SITE_URL = "https://3skrino.com";
const KEY_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const EXT_PATTERN = /^[a-z0-9]{2,5}$/;

function isProviderSetting(value: unknown): value is ProviderSetting {
  return typeof value === "string" && (PROVIDER_SETTINGS as readonly string[]).includes(value);
}

/** The admin's committed choice (Settings → Storage); tolerates the field being absent in older files. */
export function committedSetting(): ProviderSetting {
  const stored: unknown = (siteConfig as Partial<typeof siteConfig>).storage?.videoProvider;
  return isProviderSetting(stored) ? stored : "auto";
}

/**
 * Where new videos go. Precedence: the explicit `setting`, then the committed
 * site config, then NEXT_PUBLIC_STORAGE_PROVIDER, then "b2" when configured.
 * A "b2" choice without B2 credentials degrades to Vercel Blob.
 */
export function resolveProvider(setting?: ProviderSetting): VideoProvider {
  const envSetting = process.env.NEXT_PUBLIC_STORAGE_PROVIDER;
  let provider: VideoProvider;
  if (setting && setting !== "auto") provider = setting;
  else if (committedSetting() !== "auto") provider = committedSetting() as VideoProvider;
  else if (isProviderSetting(envSetting) && envSetting !== "auto") provider = envSetting;
  else provider = isB2Configured() ? "b2" : "vercel-blob";
  return provider === "b2" && !isB2Configured() ? "vercel-blob" : provider;
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

/** Base every public media URL starts with: the CDN, or <site>/media. */
export function publicBase(): string {
  const cdn = (process.env.NEXT_PUBLIC_CDN_URL ?? "").trim().replace(/\/+$/, "");
  return cdn || `${siteUrl()}${MEDIA_ROUTE}`;
}

export function publicUrlFor(key: string): string {
  return `${publicBase()}/${key}`;
}

function randomId(length: number): string {
  let id = "";
  for (let i = 0; i < length; i++) id += KEY_ALPHABET[randomInt(KEY_ALPHABET.length)];
  return id;
}

/** "<folder>/<epoch ms>-<12 random>.<ext>" — the only way object keys are minted. */
export function makeKey(folder: MediaFolder, filename: string): string {
  const fromName = /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase() ?? "";
  const ext = EXT_PATTERN.test(fromName) ? fromName : folder === "videos" ? "mp4" : "jpg";
  const key = `${folder}/${Date.now()}-${randomId(12)}.${ext}`;
  if (!KEY_PATTERN.test(key)) throw new StorageError(`Minted an invalid object key "${key}"`, 500);
  return key;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The object key inside a public URL this store produced, or null. Accepts
 * <publicBase>/<key>, plus any …/media/<key> on the site's own host or
 * localhost (so URLs saved from a preview or dev server still resolve).
 */
export function keyFromUrl(url: string): string | null {
  const direct = keyFromPublicUrl(url, publicBase());
  if (direct) return direct;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  const trusted = new Set([hostOf(siteUrl()), "localhost", "127.0.0.1"]);
  if (!trusted.has(host)) return null;

  const match = new RegExp(`^${MEDIA_ROUTE}/(.+)$`).exec(parsed.pathname);
  if (!match) return null;
  let key: string;
  try {
    key = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return KEY_PATTERN.test(key) ? key : null;
}

/** Rejects uploads the bucket shouldn't sign: wrong type for the folder, empty or oversized. */
export function assertUpload(folder: MediaFolder, contentType: string, size: number): void {
  const allowed = ALLOWED_TYPES[folder];
  if (!allowed) throw new StorageError(`Unknown folder "${folder}"`, 400);
  if (!allowed.includes(contentType)) {
    throw new StorageError(`${contentType || "That file type"} isn't allowed in ${folder} — use ${allowed.join(", ")}`, 400);
  }
  if (!Number.isFinite(size) || size <= 0) throw new StorageError("The file is empty", 400);
  const max = folder === "videos" ? LIMITS.maxVideoBytes : LIMITS.maxImageBytes;
  if (size > max) {
    throw new StorageError(`The file is too large (${formatBytes(size)}) — the limit for ${folder} is ${formatBytes(max)}`, 400);
  }
}

function formatBytes(bytes: number): string {
  const MiB = 1024 * 1024;
  // Two decimals, so a file just over a limit never reads "too large (2.0 GB) — the limit is 2.0 GB".
  return bytes >= 1024 * MiB ? `${(bytes / (1024 * MiB)).toFixed(2)} GB` : `${(bytes / MiB).toFixed(2)} MB`;
}
