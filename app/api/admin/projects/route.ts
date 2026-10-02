import type { Project } from "@/data/projects";
import { isAuthorized, unauthorized } from "@/lib/admin/auth";
import {
  ProjectsFileError,
  errorResponse,
  mutateProjects,
  readJson,
  readProjects,
  slugify,
  uniqueId,
  validateProject,
} from "@/lib/admin/projects-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireId(body: Record<string, unknown>): string {
  if (typeof body.id !== "string" || !body.id) throw new ProjectsFileError('"id" is required');
  return body.id;
}

function findOrThrow(projects: Project[], id: string): Project {
  const found = projects.find((p) => p.id === id);
  if (!found) throw new ProjectsFileError(`No project with id "${id}"`, 404);
  return found;
}

/** GET → { projects, sha } */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    return Response.json(await readProjects());
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * POST { project } → appended; id derived from the title when missing or taken.
 * POST { duplicateOf: id } → a copy with id "<id>-copy" and title "<title> (copy)".
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const body = await readJson(request);

    if (typeof body.duplicateOf === "string") {
      const sourceId = body.duplicateOf;
      const res = await mutateProjects((projects) => {
        const source = findOrThrow(projects, sourceId);
        const taken = new Set(projects.map((p) => p.id));
        const copy = validateProject({
          ...source,
          id: uniqueId(`${source.id}-copy`, taken),
          title: `${source.title} (copy)`.slice(0, 120),
          featured: false,
          createdAt: new Date().toISOString(),
        });
        // The copy lands right after its source so it's easy to find.
        const at = projects.indexOf(source) + 1;
        return {
          projects: [...projects.slice(0, at), copy, ...projects.slice(at)],
          message: `admin: duplicate project — ${source.title}`,
          result: copy,
        };
      });
      return Response.json({ ok: true, project: res.result, projects: res.projects, sha: res.sha });
    }

    const input = body.project;
    if (typeof input !== "object" || input === null) throw new ProjectsFileError('"project" is required');

    const res = await mutateProjects((projects) => {
      const taken = new Set(projects.map((p) => p.id));
      const draft = input as Record<string, unknown>;
      const wanted = typeof draft.id === "string" && draft.id ? draft.id : slugify(String(draft.title ?? ""));
      const project = validateProject({
        ...draft,
        id: uniqueId(slugify(wanted), taken),
        createdAt: typeof draft.createdAt === "string" ? draft.createdAt : new Date().toISOString(),
      });
      return {
        projects: [...projects, project],
        message: `admin: add project — ${project.title}`,
        result: project,
      };
    });
    return Response.json({ ok: true, project: res.result, projects: res.projects, sha: res.sha });
  } catch (err) {
    return errorResponse(err);
  }
}

/** PUT { id, patch } → merged and re-validated. The id itself is immutable. */
export async function PUT(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const body = await readJson(request);
    const id = requireId(body);
    const patch = body.patch;
    if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
      throw new ProjectsFileError('"patch" must be an object');
    }

    const res = await mutateProjects((projects) => {
      const current = findOrThrow(projects, id);
      const updated = validateProject({ ...current, ...patch, id });
      return {
        projects: projects.map((p) => (p.id === id ? updated : p)),
        message: `admin: update project — ${updated.title}`,
        result: updated,
      };
    });
    return Response.json({ ok: true, project: res.result, projects: res.projects, sha: res.sha });
  } catch (err) {
    return errorResponse(err);
  }
}

/** DELETE { id } */
export async function DELETE(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const id = requireId(await readJson(request));
    const res = await mutateProjects((projects) => {
      const target = findOrThrow(projects, id);
      return {
        projects: projects.filter((p) => p.id !== id),
        message: `admin: delete project — ${target.title}`,
        result: target,
      };
    });
    return Response.json({ ok: true, projects: res.projects, sha: res.sha });
  } catch (err) {
    return errorResponse(err);
  }
}
