"use client";

import { useMemo, useState } from "react";
import { btn, card, Empty, input, micro, TabHeader } from "@/components/admin/ui";
import { allCategories as categories, getCategory } from "@/data/categories";
import type { Project } from "@/data/projects";

type Props = {
  projects: Project[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: (ids: string[], on: boolean) => void;
};

/**
 * A flat, sortable table of every project for bulk work: filter, tick, then
 * use the bar at the bottom (feature, unfeature, move, delete — one commit).
 */
export default function BulkTab({ projects, selected, onToggle, onSelectAll }: Props) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("");
  const [only, setOnly] = useState<"" | "featured" | "no-thumb" | "no-video">("");
  const [sort, setSort] = useState<"order" | "title" | "year">("order");

  const shown = useMemo(() => {
    const q = query.toLowerCase();
    const list = projects.filter(
      (p) =>
        (!cat || p.category === cat) &&
        (!q || `${p.title} ${p.client} ${(p.tags ?? []).join(" ")}`.toLowerCase().includes(q)) &&
        (only === "featured" ? p.featured : only === "no-thumb" ? !p.thumbnail : only === "no-video" ? !p.videoUrl : true),
    );
    if (sort === "title") return [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "year") return [...list].sort((a, b) => b.year - a.year);
    return list;
  }, [projects, query, cat, only, sort]);

  const ids = shown.map((p) => p.id);
  const allOn = ids.length > 0 && ids.every((id) => selected.has(id));

  return (
    <div>
      <TabHeader title="Bulk" hint={`${selected.size} selected · tick rows, then act on them from the bar at the bottom · Esc clears`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, client, tags…" className={`${input} max-w-xs`} aria-label="Search" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={`${input} w-44`} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={only} onChange={(e) => setOnly(e.target.value as typeof only)} className={`${input} w-44`} aria-label="Only">
          <option value="">Any</option>
          <option value="featured">Featured only</option>
          <option value="no-thumb">Missing cover</option>
          <option value="no-video">Missing video</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={`${input} w-36`} aria-label="Sort">
          <option value="order">Site order</option>
          <option value="title">Title A–Z</option>
          <option value="year">Newest</option>
        </select>
        <button type="button" className={btn} disabled={!ids.length} onClick={() => onSelectAll(ids, !allOn)}>
          {allOn ? "Untick shown" : `Tick all ${ids.length}`}
        </button>
      </div>

      {!shown.length ? (
        <Empty>No project matches</Empty>
      ) : (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className={`${micro} text-[9px] text-white/40`}>
              <tr className="border-b border-white/10">
                <th className="w-10 p-2">
                  <input type="checkbox" checked={allOn} onChange={() => onSelectAll(ids, !allOn)} aria-label="Tick all shown" className="accent-[#e7fe55]" />
                </th>
                <th className="p-2">Title</th>
                <th className="p-2">Category</th>
                <th className="p-2">Client</th>
                <th className="p-2">Year</th>
                <th className="p-2">Shape</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const on = selected.has(p.id);
                return (
                  <tr key={p.id} className={`border-b border-white/5 ${on ? "bg-[#e7fe55]/[0.05]" : "hover:bg-white/[0.02]"}`}>
                    <td className="p-2">
                      <input type="checkbox" checked={on} onChange={() => onToggle(p.id)} aria-label={`Tick ${p.title}`} className="accent-[#e7fe55]" />
                    </td>
                    <td className="max-w-[260px] truncate p-2 font-bold">{p.title}</td>
                    <td className="p-2 text-white/70">{getCategory(p.category)?.name ?? p.category}</td>
                    <td className="max-w-[160px] truncate p-2 text-white/60">{p.client}</td>
                    <td className="p-2 tabular-nums text-white/60">{p.year}</td>
                    <td className="p-2 font-mono text-[10px] uppercase text-white/50">{p.orientation === "vertical" ? "9:16" : "16:9"}</td>
                    <td className="p-2">
                      <span className="flex flex-wrap gap-1 font-mono text-[9px] uppercase tracking-widest">
                        {p.featured && <span className="bg-[#e7fe55] px-1 text-black">featured</span>}
                        {!p.thumbnail && <span className="border border-[#ff2d2d]/50 px-1 text-[#ff6b6b]">no cover</span>}
                        {!p.videoUrl && <span className="border border-white/20 px-1 text-white/45">no video</span>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
