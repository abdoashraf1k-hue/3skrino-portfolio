"use client";

import { useState } from "react";
import { card, Empty, micro, Section, Segmented, Stat, TabHeader } from "@/components/admin/ui";
import { getCategory } from "@/data/categories";
import type { Project } from "@/data/projects";

type Filter = "all" | "missing" | "auto" | "manual";
type Props = { projects: Project[]; onEdit: (p: Project) => void };

/** Every project's cover at a glance — spot the missing ones, open the editor to grab or upload a new frame. */
export default function ThumbnailsTab({ projects, onEdit }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const missing = projects.filter((p) => !p.thumbnail);
  const auto = projects.filter((p) => p.thumbnail && p.thumbnailSource === "auto");
  const manual = projects.filter((p) => p.thumbnail && p.thumbnailSource !== "auto");
  const shown = filter === "missing" ? missing : filter === "auto" ? auto : filter === "manual" ? manual : projects;

  return (
    <div>
      <TabHeader title="Thumbnails" hint="click a cover to open the project editor — grab a frame from the video or upload a still" />
      <div className="mb-8 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Projects" value={projects.length} />
        <Stat label="Missing" value={missing.length} tone={missing.length ? "bad" : "ok"} />
        <Stat label="Grabbed from video" value={auto.length} />
        <Stat label="Uploaded" value={manual.length} />
      </div>
      <Section
        title="Covers"
        aside={
          <Segmented<Filter>
            label="Filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "missing", label: `Missing (${missing.length})` },
              { value: "auto", label: "Auto" },
              { value: "manual", label: "Uploaded" },
            ]}
          />
        }
      >
        {!shown.length && <Empty>{filter === "missing" ? "Every project has a cover" : "Nothing here"}</Empty>}
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onEdit(p)} className={`${card} group flex w-full flex-col text-left hover:border-white/30`}>
                <span className={`relative block w-full overflow-hidden bg-[#111] ${p.orientation === "vertical" ? "aspect-[9/16]" : "aspect-video"}`}>
                  {p.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element -- admin grid of arbitrary blob URLs
                    <img src={p.thumbnail} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center border border-dashed border-[#ff2d2d]/50 font-mono text-[9px] uppercase tracking-widest text-[#ff6b6b]">
                      No cover
                    </span>
                  )}
                  {p.thumbnail && (
                    <span className="absolute bottom-1 left-1 bg-black/70 px-1 py-px font-mono text-[8px] uppercase tracking-widest text-white/70">
                      {p.thumbnailSource === "auto" ? "auto" : "upload"}
                    </span>
                  )}
                </span>
                <span className="block truncate px-2 pt-1.5 text-xs">{p.title}</span>
                <span className={`${micro} block truncate px-2 pb-1.5 text-[8px] text-white/35`}>
                  {getCategory(p.category)?.name ?? p.category} · {p.videoUrl ? "has video" : "no video"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
