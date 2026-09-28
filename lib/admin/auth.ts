import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Server-side secret check. ADMIN_SECRET_KEY never leaves the server: callers
 * pass in what the client sent, and get back a boolean.
 */

function digest(value: string): Buffer {
  // Hashing first gives equal-length buffers, so timingSafeEqual never throws
  // and the comparison doesn't leak the secret's length.
  return createHash("sha256").update(value, "utf8").digest();
}

export function isValidAdminKey(candidate: string | null | undefined): boolean {
  const secret = process.env.ADMIN_SECRET_KEY;
  if (!secret || !candidate) return false;
  return timingSafeEqual(digest(candidate), digest(secret));
}

/** Reads `Authorization: Bearer <key>` from a request and checks it. */
export function isAuthorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return isValidAdminKey(match?.[1]?.trim());
}

export function unauthorized(): Response {
  return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}
