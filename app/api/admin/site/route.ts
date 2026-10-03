import { isAuthorized, unauthorized } from "@/lib/admin/auth";
import { errorResponse, readJson } from "@/lib/admin/projects-file";
import { readSite, writeSite } from "@/lib/admin/site-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Optional commit subject the admin may pass ("admin: update theme"); anything else falls back. */
const MESSAGE = /^admin: [\w ,.'&/-]{1,80}$/;

/** GET → { config, sha } */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    return Response.json(await readSite());
  } catch (err) {
    return errorResponse(err);
  }
}

/** PUT { config, message? } → validated, committed to data/site-config.ts (+ backup) → { config, sha } */
export async function PUT(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const { config, message } = await readJson(request);
    const msg = typeof message === "string" && MESSAGE.test(message) ? message : undefined;
    return Response.json({ ok: true, ...(await writeSite(config, msg)) });
  } catch (err) {
    return errorResponse(err);
  }
}
