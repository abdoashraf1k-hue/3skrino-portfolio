import { isAuthorized, unauthorized } from "@/lib/admin/auth";
import { getCommit } from "@/lib/admin/github";
import { adminLog, revertCommit } from "@/lib/admin/logs";
import { ProjectsFileError, errorResponse, readJson } from "@/lib/admin/projects-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → { entries } · GET ?sha= → { commit } with per-file diffs */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const sha = new URL(request.url).searchParams.get("sha");
    if (sha) return Response.json({ commit: await getCommit(sha) });
    return Response.json({ entries: await adminLog(40) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** POST { action: "revert", sha } → { sha, files } */
export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const { action, sha } = await readJson(request);
    if (action !== "revert" || typeof sha !== "string") throw new ProjectsFileError('Expected { action: "revert", sha }');
    return Response.json({ ok: true, ...(await revertCommit(sha)) });
  } catch (err) {
    return errorResponse(err);
  }
}
