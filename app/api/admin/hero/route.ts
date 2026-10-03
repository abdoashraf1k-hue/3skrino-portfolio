import { isAuthorized, unauthorized } from "@/lib/admin/auth";
import { readHero, writeHero } from "@/lib/admin/hero-file";
import { errorResponse, readJson } from "@/lib/admin/projects-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → { config, sha } */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    return Response.json(await readHero());
  } catch (err) {
    return errorResponse(err);
  }
}

/** PUT { config } → validated, committed to data/hero-config.ts → { config, sha } */
export async function PUT(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const { config } = await readJson(request);
    return Response.json({ ok: true, ...(await writeHero(config)) });
  } catch (err) {
    return errorResponse(err);
  }
}
