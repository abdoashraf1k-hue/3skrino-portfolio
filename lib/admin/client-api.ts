import type { Project } from "@/data/projects";

/**
 * Browser-side client for /api/admin/*. Every call carries
 * `Authorization: Bearer <key>`; the key lives in sessionStorage only.
 */

export const KEY_STORAGE = "3skrino-admin-key";

export class AuthError extends Error {
  constructor() {
    super("Your admin key was rejected");
    this.name = "AuthError";
  }
}

/** A non-401 error response from /api/admin/*, with its HTTP status. */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type ProjectsResponse = { projects: Project[]; sha: string };

export function readStoredKey(): string {
  try {
    return sessionStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function storeKey(key: string): void {
  try {
    sessionStorage.setItem(KEY_STORAGE, key);
  } catch {
    // Private mode / blocked storage — the key still lives in memory for this tab.
  }
}

export function clearStoredKey(): void {
  try {
    sessionStorage.removeItem(KEY_STORAGE);
  } catch {
    // ignore
  }
}

export async function adminFetch<T>(key: string, path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/admin/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (res.status === 401) throw new AuthError();

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // handled below
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}
