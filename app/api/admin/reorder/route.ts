import { isAuthorized, unauthorized } from "@/lib/admin/auth";
import { ProjectsFileError, errorResponse, mutateProjects, readJson } from "@/lib/admin/projects-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { ids } — the full new order. Must be an exact permutation of the current ids. */
export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const { ids } = await readJson(request);
    if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === "string")) {
      throw new ProjectsFileError('"ids" must be an array of strings');
    }

    const res = await mutateProjects((projects) => {
      const byId = new Map(projects.map((p) => [p.id, p]));
      const sameSet = ids.length === projects.length && new Set(ids).size === ids.length && ids.every((id) => byId.has(id));
      if (!sameSet) {
        // Someone added/removed a project since the client loaded — don't guess.
        throw new ProjectsFileError("Project list changed since you loaded it — refresh and try again", 409);
      }
      return {
        projects: ids.map((id) => byId.get(id)!),
        message: "admin: reorder projects",
        result: null,
      };
    });
    return Response.json({ ok: true, projects: res.projects, sha: res.sha });
  } catch (err) {
    return errorResponse(err);
  }
}
