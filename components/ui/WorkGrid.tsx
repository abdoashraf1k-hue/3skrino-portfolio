"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import ProjectCard from "@/components/ui/ProjectCard";
import type { Category } from "@/data/categories";
import { projectCredits, type Project } from "@/data/projects";
import { cn, EASE_OUT } from "@/lib/utils";

type WorkGridProps = {
  projects: Project[];
  categories: Category[];
};

type Sort = "newest" | "oldest" | "az";
type Orient = "" | "vertical" | "horizontal";
type Credit = "filmed" | "directed" | "edited";

type State = { cat: string; credits: Credit[]; orient: Orient; year: string; sort: Sort };

const DEFAULT: State = { cat: "all", credits: [], orient: "", year: "", sort: "newest" };
const CREDITS: { id: Credit; icon: string; label: string }[] = [
  { id: "filmed", icon: "🎬", label: "Shot" },
  { id: "directed", icon: "🎥", label: "Directed" },
  { id: "edited", icon: "✂️", label: "Edited" },
];

function fromParams(p: URLSearchParams | null): State {
  if (!p) return DEFAULT;
  const sort = p.get("sort");
  const orient = p.get("orient");
  return {
    cat: p.get("cat") || "all",
    credits: CREDITS.map((c) => c.id).filter((id) => p.get(id) === "1"),
    orient: orient === "vertical" || orient === "horizontal" ? orient : "",
    year: p.get("year") ?? "",
    sort: sort === "oldest" || sort === "az" ? sort : "newest",
  };
}

function writeParams(s: State) {
  const url = new URL(window.location.href);
  const set = (k: string, v: string) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
  set("cat", s.cat === "all" ? "" : s.cat);
  for (const c of CREDITS) set(c.id, s.credits.includes(c.id) ? "1" : "");
  set("orient", s.orient);
  set("year", s.year);
  set("sort", s.sort === "newest" ? "" : s.sort);
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
}

const time = (p: Project) => (p.createdAt ? Date.parse(p.createdAt) : Date.UTC(p.year, 0, 1));

/** Reads ?cat=&filmed=1&orient=&year=&sort= — must sit under <Suspense> on a static page. */
function WithParams(props: WorkGridProps) {
  return <Grid {...props} initial={fromParams(useSearchParams())} />;
}

/** Filterable, shareable grid for /work. Filters combine with AND and sync to the URL. */
export default function WorkGrid(props: WorkGridProps) {
  return (
    <Suspense fallback={<Grid {...props} initial={DEFAULT} />}>
      <WithParams {...props} />
    </Suspense>
  );
}

function Grid({ projects, categories, initial }: WorkGridProps & { initial: State }) {
  const [state, setState] = useState<State>(initial);
  const set = <K extends keyof State>(k: K, v: State[K]) => setState((s) => ({ ...s, [k]: v }));

  // Debounced URL sync — filtering itself is instant.
  useEffect(() => {
    const id = window.setTimeout(() => writeParams(state), 200);
    return () => window.clearTimeout(id);
  }, [state]);

  const years = useMemo(() => [...new Set(projects.map((p) => p.year))].sort((a, b) => b - a), [projects]);
  const filters = categories.filter((c) => projects.some((p) => p.category === c.id));

  const visible = useMemo(() => {
    const list = projects.filter((p) => {
      if (state.cat !== "all" && p.category !== state.cat) return false;
      if (state.orient && p.orientation !== state.orient) return false;
      if (state.year && String(p.year) !== state.year) return false;
      const c = projectCredits(p);
      return state.credits.every((k) => c[k]);
    });
    const order = new Map(projects.map((p, i) => [p.id, i]));
    return list.sort((a, b) => {
      if (state.sort === "az") return a.title.localeCompare(b.title);
      const d = time(b) - time(a);
      const byDate = state.sort === "newest" ? d : -d;
      return byDate || order.get(a.id)! - order.get(b.id)!;
    });
  }, [projects, state]);

  const dirty = JSON.stringify(state) !== JSON.stringify(DEFAULT);
  const pill = (on: boolean) =>
    cn(
      "border px-4 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors duration-300",
      on ? "border-accent bg-accent text-[#0a0a0a]" : "border-line text-muted hover:border-fg hover:text-fg",
    );
  const control = "h-9 border border-line bg-transparent px-3 font-mono text-[10px] uppercase tracking-widest text-muted outline-none transition-colors hover:border-fg focus:border-accent";

  return (
    <>
      <div className="mb-10 flex flex-col gap-4 md:mb-14">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
          <button type="button" onClick={() => set("cat", "all")} aria-pressed={state.cat === "all"} className={pill(state.cat === "all")}>
            All <span className="opacity-60">({projects.length})</span>
          </button>
          {filters.map((c) => (
            <button key={c.id} type="button" onClick={() => set("cat", c.id)} aria-pressed={state.cat === c.id} className={pill(state.cat === c.id)}>
              {c.name} <span className="opacity-60">({projects.filter((p) => p.category === c.id).length})</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <span className="mr-1 font-mono text-[10px] uppercase tracking-widest text-muted">Credits</span>
          {CREDITS.map((c) => {
            const on = state.credits.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => set("credits", on ? state.credits.filter((x) => x !== c.id) : [...state.credits, c.id])}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-full border px-3 font-mono text-[10px] uppercase tracking-widest transition-colors",
                  on ? "border-accent/60 bg-accent/10 text-accent" : "border-line text-muted hover:border-fg hover:text-fg",
                )}
              >
                <span aria-hidden>{c.icon}</span>
                {c.label}
              </button>
            );
          })}

          <span className="mx-1 hidden h-5 w-px bg-line md:block" />
          <div role="radiogroup" aria-label="Orientation" className="flex">
            {(
              [
                ["", "All"],
                ["vertical", "9:16"],
                ["horizontal", "16:9"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={state.orient === v}
                onClick={() => set("orient", v)}
                className={cn(
                  "-ml-px h-9 border px-3 font-mono text-[10px] uppercase tracking-widest transition-colors first:ml-0",
                  state.orient === v ? "relative z-10 border-fg text-fg" : "border-line text-muted hover:text-fg",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <select aria-label="Year" value={state.year} onChange={(e) => set("year", e.target.value)} className={control}>
            <option value="">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <label className="ml-auto flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted">Sort</span>
            <select aria-label="Sort" value={state.sort} onChange={(e) => set("sort", e.target.value as Sort)} className={control}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="az">A–Z</option>
            </select>
          </label>
        </div>

        <p aria-live="polite" className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-widest text-muted">
          {visible.length} {visible.length === 1 ? "project" : "projects"}
          {dirty && (
            <button type="button" onClick={() => setState(DEFAULT)} className="text-accent underline-offset-4 hover:underline">
              Reset filters
            </button>
          )}
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-start gap-4 border-y border-line py-20">
          <p className="text-2xl font-black uppercase tracking-tight md:text-4xl">Nothing matches — yet.</p>
          <button type="button" onClick={() => setState(DEFAULT)} className={pill(false)}>
            Reset filters
          </button>
        </div>
      ) : (
        <motion.div layout className="grid grid-flow-row-dense grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {visible.map((project) => (
              <motion.div
                key={project.id}
                layout
                className={cn(project.orientation === "horizontal" && "col-span-2")}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.6, ease: EASE_OUT }}
              >
                <ProjectCard project={project} index={projects.indexOf(project)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </>
  );
}
