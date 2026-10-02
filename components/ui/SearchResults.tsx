"use client";

import Fuse from "fuse.js";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Placeholder from "@/components/ui/Placeholder";
import ProjectBadges from "@/components/ui/ProjectBadges";
import { categories, getCategory } from "@/data/categories";
import { projectHref, projects, type Project } from "@/data/projects";
import { cn } from "@/lib/utils";

type Doc = Project & { categoryName: string };

const docs: Doc[] = projects.map((p) => ({ ...p, categoryName: getCategory(p.category)?.name ?? p.category }));

const SUGGESTIONS = ["sports", "fashion", "AI", "DaVinci Resolve", "Tours", "restaurant"];

function MiniCard({ project, index }: { project: Doc; index: number }) {
  return (
    <Link href={projectHref(project)} data-track="project" data-track-id={project.id} className="group flex gap-4 border-t border-line py-5">
      <div className={cn("relative shrink-0 overflow-hidden rounded-sm bg-bg-soft", project.orientation === "vertical" ? "aspect-[9/16] w-16" : "aspect-video w-28")}>
        <Placeholder title="" seed={index} image={project.thumbnail || undefined} accent={project.accentColor} sizes="112px" size="sm" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
          {project.categoryName} · {project.year} · {project.client}
        </p>
        <p className="truncate text-2xl font-black uppercase tracking-tight transition-colors duration-300 group-hover:text-accent md:text-3xl">
          {project.title}
        </p>
        <ProjectBadges filmed={project.filmed} directed={project.directed} edited={project.edited} />
      </div>
      <span aria-hidden className="self-center font-mono text-sm text-muted transition-transform duration-300 group-hover:translate-x-1 group-hover:text-accent">
        →
      </span>
    </Link>
  );
}

function Search({ initial }: { initial: string }) {
  const [q, setQ] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  const fuse = useMemo(
    () =>
      new Fuse(docs, {
        keys: [
          { name: "title", weight: 3 },
          { name: "categoryName", weight: 2 },
          { name: "tags", weight: 2 },
          { name: "tools", weight: 1.5 },
          { name: "client", weight: 1 },
          { name: "description", weight: 1 },
        ],
        threshold: 0.36,
        ignoreLocation: true,
      }),
    [],
  );

  const results = useMemo(() => (q.trim() ? fuse.search(q.trim()).map((r) => r.item) : []), [q, fuse]);

  // Debounced ?q= so a search is shareable.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const url = new URL(window.location.href);
      if (q.trim()) url.searchParams.set("q", q.trim());
      else url.searchParams.delete("q");
      if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
    }, 250);
    return () => window.clearTimeout(id);
  }, [q]);

  return (
    <div>
      <label className="flex items-center gap-4 border-b border-fg/40 pb-4 focus-within:border-accent">
        <span aria-hidden className="font-mono text-2xl text-accent">
          ⌕
        </span>
        <input
          ref={inputRef}
          autoFocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Try “sushi”, “Runway” or “automotive”"
          aria-label="Search projects"
          className="w-full bg-transparent text-[clamp(1.5rem,4vw,3rem)] font-medium tracking-tight outline-none placeholder:text-muted/50"
        />
      </label>

      {!q.trim() ? (
        <div className="mt-10 flex flex-wrap items-center gap-2">
          <span className="mr-2 font-mono text-[10px] uppercase tracking-widest text-muted">Try</span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setQ(s);
                inputRef.current?.focus();
              }}
              className="border border-line px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted transition-colors hover:border-fg hover:text-fg"
            >
              {s}
            </button>
          ))}
          <span className="basis-full" />
          <p className="mt-6 font-mono text-[10px] uppercase tracking-widest text-muted">
            {projects.length} projects across {categories.length} fields · Ctrl/⌘ K opens quick search anywhere
          </p>
        </div>
      ) : (
        <div className="mt-10">
          <p aria-live="polite" className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted">
            {results.length} {results.length === 1 ? "result" : "results"} for “{q.trim()}”
          </p>
          {results.length === 0 ? (
            <p className="border-t border-line py-16 text-2xl font-black uppercase tracking-tight text-muted">Nothing yet — try a field or a tool.</p>
          ) : (
            <div className="border-b border-line">
              {results.map((p) => (
                <MiniCard key={p.id} project={p} index={projects.findIndex((x) => x.id === p.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WithParams() {
  return <Search initial={useSearchParams().get("q") ?? ""} />;
}

export default function SearchResults() {
  return (
    <Suspense fallback={<Search initial="" />}>
      <WithParams />
    </Suspense>
  );
}
