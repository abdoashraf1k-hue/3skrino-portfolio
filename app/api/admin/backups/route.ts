import { isAuthorized, unauthorized } from "@/lib/admin/auth";
import { listBackups, pruneOldBackups, readBackup, restoreBackup } from "@/lib/admin/backups";
import { ProjectsFileError, errorResponse, readJson, readProjects } from "@/lib/admin/projects-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → { backups } (newest first) */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    return Response.json({ backups: await listBackups() });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * POST { action: "read", path }    → { content }
 * POST { action: "restore", path } → { projects, sha } after the restore commit
 * POST { action: "prune" }         → { removed }
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const { action, path } = await readJson(request);
    if (action === "prune") return Response.json({ ok: true, removed: await pruneOldBackups() });
    if (typeof path !== "string") throw new ProjectsFileError('"path" is required');
    if (action === "read") return Response.json({ ok: true, content: await readBackup(path) });
    if (action === "restore") {
      await restoreBackup(path);
      return Response.json({ ok: true, ...(await readProjects()) });
    }
    throw new ProjectsFileError("Unknown action");
  } catch (err) {
    return errorResponse(err);
  }
}
