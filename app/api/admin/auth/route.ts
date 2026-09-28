import { isValidAdminKey, unauthorized } from "@/lib/admin/auth";

export const runtime = "nodejs";

/** POST { key } → { ok: true } or 401. */
export async function POST(request: Request) {
  let key: unknown;
  try {
    ({ key } = (await request.json()) as { key?: unknown });
  } catch {
    return unauthorized();
  }
  if (typeof key !== "string" || !isValidAdminKey(key)) return unauthorized();
  return Response.json({ ok: true });
}
