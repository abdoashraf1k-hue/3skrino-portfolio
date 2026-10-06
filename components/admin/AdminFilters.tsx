"use client";

import Fuse from "fuse.js";
import { useMemo, type ReactNode, type Ref } from "react";
import { allCategories as categories } from "@/data/categories";
import { projectCredits, type Project } from "@/data/projects";

export type Filters = {
  q: string;
  cat: string; // "" = all
  filmed: boolean;
  directed: boolean;
  edited: boolean;
  featured: boolean;
  orient: "" | "vertical" | "horizontal";
  year: string; // "" = all
};

export const EMPTY_FILTERS: Filters = {
  q: "",
  cat: "",
  filmed: false,
  directed: false,
  edited: false,
  featured: false,
  orient: "",
  year: "",
};

const FLAGS = ["filmed", "directed", "edited", "featured"] as const;

export function isFiltering(f: Filters): boolean {
  return Boolean(f.q.trim() || f.cat || f.orient || f.year || FLAGS.some((k) => f[k]));
}

/** ?q=&cat=sports&filmed=1&orient=vertical&year=2026 — every other param (e.g. key, tab) is preserved. */
export function filtersFromParams(params: URLSearchParams): Filters {
  const orient = params.get("orient");
  return {
    q: params.get("q") ?? "",
    cat: params.get("cat") ?? "",
    filmed: params.get("filmed") === "1",
    directed: params.get("directed") === "1",
    edited: params.get("edited") === "1",
    featured: params.get("featured") === "1",
    orient: orient === "vertical" || orient === "horizontal" ? orient : "",
    year: params.get("year") ?? "",
  };
}

export function writeFiltersToUrl(f: Filters): void {
  const url = new URL(window.location.href);
  const set = (k: string, v: string) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
  set("q", f.q.trim());
  set("cat", f.cat);
  for (const k of FLAGS) set(k, f[k] ? "1" : "");
  set("orient", f.orient);
  set("year", f.year);
  window.history.replaceState(window.history.state, "", url);
}

/** All filters combine with AND. The search is fuzzy (title first, then client/tags). */
export function useFilteredProjects(projects: Project[], f: Filters): Project[] {
  const fuse = useMemo(
    () =>
      new Fuse(projects, {
        keys: [
          { name: "title", weight: 3 },
          { name: "client", weight: 1 },
          { name: "tags", weight: 1 },
        ],
        threshold: 0.38,
        ignoreLocation: true,
      }),
    [projects],
  );
  return useMemo(() => {
    const q = f.q.trim();
    const matched = q ? new Set(fuse.search(q).map((r) => r.item.id)) : null;
    return projects.filter((p) => {
      if (matched && !matched.has(p.id)) return false;
      if (f.cat && p.category !== f.cat) return false;
      if (f.orient && p.orientation !== f.orient) return false;
      if (f.year && String(p.year) !== f.year) return false;
      const c = projectCredits(p);
      if (f.filmed && !c.filmed) return false;
      if (f.directed && !c.directed) return false;
      if (f.edited && !c.edited) return false;
      if (f.featured && !p.featured) return false;
      return true;
    });
  }, [projects, f, fuse]);
}

const select =
  "h-9 rounded-sm border border-white/10 bg-[#111] px-2 font-mono text-[10px] uppercase tracking-widest text-white/80 outline-none focus:border-[#e7fe55]";

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-9 rounded-sm border px-3 font-mono text-[10px] uppercase tracking-widest transition-colors ${
        on ? "border-[#e7fe55] bg-[#e7fe55]/10 text-[#e7fe55]" : "border-white/10 text-white/50 hover:border-white/30 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

type Props = {
  value: Filters;
  onChange: (next: Filters) => void;
  years: number[];
  resultCount: number;
  total: number;
  searchRef: Ref<HTMLInputElement>;
};

export default function AdminFilters({ value: f, onChange, years, resultCount, total, searchRef }: Props) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...f, [k]: v });
  const active = isFiltering(f);

  return (
    <div className="mb-6 flex flex-col gap-3 border border-white/10 bg-[#0d0d0d] p-3 md:flex-row md:flex-wrap md:items-center">
      <label className="relative flex min-w-56 flex-1 items-center">
        <span aria-hidden className="pointer-events-none absolute left-3 text-white/30">
          ⌕
        </span>
        <input
          ref={searchRef}
          type="search"
          value={f.q}
          onChange={(e) => set("q", e.target.value)}
          placeholder="Search projects…"
          aria-label="Search projects"
          className="h-9 w-full rounded-sm border border-white/10 bg-[#111] pl-8 pr-14 text-sm outline-none placeholder:text-white/25 focus:border-[#e7fe55]"
        />
        <kbd className="pointer-events-none absolute right-2 rounded border border-white/15 px-1.5 font-mono text-[9px] text-white/40">
          Ctrl K
        </kbd>
      </label>

      <select aria-label="Category" value={f.cat} onChange={(e) => set("cat", e.target.value)} className={select}>
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <div className="flex flex-wrap gap-1.5">
        <Toggle on={f.filmed} onClick={() => set("filmed", !f.filmed)}>
          🎬 Filmed
        </Toggle>
        <Toggle on={f.directed} onClick={() => set("directed", !f.directed)}>
          🎥 Directed
        </Toggle>
        <Toggle on={f.edited} onClick={() => set("edited", !f.edited)}>
          ✂️ Edited
        </Toggle>
        <Toggle on={f.featured} onClick={() => set("featured", !f.featured)}>
          ⭐ Featured
        </Toggle>
      </div>

      <div role="radiogroup" aria-label="Orientation" className="flex gap-1.5">
        {(
          [
            ["", "All"],
            ["vertical", "9:16"],
            ["horizontal", "16:9"],
          ] as const
        ).map(([v, label]) => (
          <Toggle key={label} on={f.orient === v} onClick={() => set("orient", v)}>
            {label}
          </Toggle>
        ))}
      </div>

      <select aria-label="Year" value={f.year} onChange={(e) => set("year", e.target.value)} className={select}>
        <option value="">All years</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      {active && (
        <div className="flex items-center gap-3 md:ml-auto">
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">
            {resultCount} / {total} · reorder locked
          </span>
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="font-mono text-[10px] uppercase tracking-widest text-[#e7fe55] hover:underline"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
