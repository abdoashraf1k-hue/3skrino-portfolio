import { allCategories as categories } from "@/data/categories";
import type { Project } from "@/data/projects";
import { isAuthorized, unauthorized } from "@/lib/admin/auth";
import { ProjectsFileError, errorResponse, mutateProjects, readJson, validateProject } from "@/lib/admin/projects-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORY_IDS = new Set(categories.map((c) => c.id));

type Action = "feature" | "unfeature" | "category" | "delete" | "move" | "retag";

/**
 * POST { action, ids, category?, order? } — many projects, ONE commit.
 *
 * Every write is read → modify → commit against GitHub, so N parallel
 * single-project requests would race on the same file and mostly 409. One
 * atomic request is both faster and correct.
 *
 *  feature / unfeature  — toggle `featured` on ids
 *  category             — move ids to `category`
 *  delete               — remove ids
 *  move                 — move ids to `category`, then apply `order` (a full
 *                         permutation of project ids) — used by cross-category drag
 *  retag                — rename tag `from` to `to` on ids (admin → Tags); an empty
 *                         `to` removes the tag. Merging = renaming onto an existing tag.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) return unauthorized();
  try {
    const body = await readJson(request);
    const action = body.action as Action;
    const ids = body.ids;
    if (!["feature", "unfeature", "category", "delete", "move", "retag"].includes(action)) {
      throw new ProjectsFileError("Unknown bulk action");
    }
    if (!Array.isArray(ids) || !ids.length || !ids.every((id): id is string => typeof id === "string")) {
      throw new ProjectsFileError('"ids" must be a non-empty array of strings');
    }
    const category = typeof body.category === "string" ? body.category : "";
    if ((action === "category" || action === "move") && !CATEGORY_IDS.has(category)) {
      throw new ProjectsFileError(`Unknown category "${category}"`);
    }
    const from = typeof body.from === "string" ? body.from.trim().toLowerCase() : "";
    const to = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
    if (action === "retag" && (!from || to.length > 40)) throw new ProjectsFileError('"retag" needs a "from" tag (and a "to" of 40 characters or fewer)');
    const order = Array.isArray(body.order) && body.order.every((id) => typeof id === "string") ? (body.order as string[]) : null;

    const res = await mutateProjects((projects) => {
      const wanted = new Set(ids);
      const missing = ids.filter((id) => !projects.some((p) => p.id === id));
      if (missing.length) throw new ProjectsFileError(`No project with id "${missing[0]}"`, 404);

      let next: Project[];
      switch (action) {
        case "delete":
          next = projects.filter((p) => !wanted.has(p.id));
          break;
        case "retag":
          next = projects.map((p) => {
            if (!wanted.has(p.id) || !p.tags?.some((t) => t.toLowerCase() === from)) return p;
            const renamed = p.tags.map((t) => (t.toLowerCase() === from ? to : t)).filter(Boolean);
            return validateProject({ ...p, tags: [...new Set(renamed)] });
          });
          break;
        case "feature":
        case "unfeature":
          next = projects.map((p) => (wanted.has(p.id) ? validateProject({ ...p, featured: action === "feature" }) : p));
          break;
        default:
          next = projects.map((p) => (wanted.has(p.id) ? validateProject({ ...p, category }) : p));
      }

      if (action === "move" && order) {
        const byId = new Map(next.map((p) => [p.id, p]));
        const same = order.length === next.length && new Set(order).size === order.length && order.every((id) => byId.has(id));
        if (!same) throw new ProjectsFileError("Project list changed since you loaded it — refresh and try again", 409);
        next = order.map((id) => byId.get(id)!);
      }

      const n = ids.length;
      const noun = `${n} project${n === 1 ? "" : "s"}`;
      const message = {
        delete: `admin: delete ${noun}`,
        feature: `admin: feature ${noun}`,
        unfeature: `admin: unfeature ${noun}`,
        category: `admin: move ${noun} to ${category}`,
        move: `admin: move ${noun} to ${category}`,
        retag: to ? `admin: rename tag ${from} to ${to} in ${noun}` : `admin: remove tag ${from} from ${noun}`,
      }[action];
      return { projects: next, message, result: null };
    });
    return Response.json({ ok: true, projects: res.projects, sha: res.sha });
  } catch (err) {
    return errorResponse(err);
  }
}
