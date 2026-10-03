import { isAuthorized, unauthorized } from "@/lib/admin/auth";
import {
  lastBackupDate,
  listBackups,
  pruneOldBackups,
  readBackup,
  restoreBackup,
  snapshotAll,
  type BackupTarget,
} from "@/lib/admin/backups";
import { parseHeroFile } from "@/lib/admin/hero-file";
import { ProjectsFileError, errorResponse, parseProjectsFile, readJson, readProjects } from "@/lib/admin/projects-file";
import { parseSiteFile } from "@/lib/admin/site-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Throws if the site couldn't load `content` as `target`. */
function check(target: BackupTarget, content: string) {
  if (target === "projects") parseProjectsFile(content);
  else if (target === "hero-config") parseHeroFile(content);
  else parseSiteFile(content);
}

/** GET → { backups, lastBackup } (newest first) */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const [backups, lastBackup] = await Promise.all([listBackups(), lastBackupDate()]);
    return Response.json({ backups, lastBackup });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * POST { action: "read", path }    → { content }
 * POST { action: "restore", path } → { target, projects?, sha? } after the restore commit
 * POST { action: "snapshot" }      → { sha, files } — "Backup now": every data file, one commit
 * POST { action: "prune" }         → { removed }
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const { action, path } = await readJson(request);
    if (action === "prune") return Response.json({ ok: true, removed: await pruneOldBackups() });
    if (action === "snapshot") return Response.json({ ok: true, ...(await snapshotAll("manual snapshot from the admin")) });
    if (typeof path !== "string") throw new ProjectsFileError('"path" is required');
    if (action === "read") return Response.json({ ok: true, content: await readBackup(path) });
    if (action === "restore") {
      const target = await restoreBackup(path, check);
      return Response.json({ ok: true, target, ...(target === "projects" ? await readProjects() : {}) });
    }
    throw new ProjectsFileError("Unknown action");
  } catch (err) {
    return errorResponse(err);
  }
}
