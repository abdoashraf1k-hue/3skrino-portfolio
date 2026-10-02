"use client";

import { projectCredits, type Project } from "@/data/projects";
import { SourceChip } from "./VideoUploader";

/** Subtle marker for AI-generated work (category "ai"). */
export function AiChip({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-[#9b8cff]/40 bg-[#9b8cff]/10 px-1.5 py-px font-mono text-[9px] uppercase tracking-widest text-[#b9adff] ${className}`}
    >
      AI
    </span>
  );
}

/** 40×40 still from `thumbnail`; falls back to the accent swatch. */
export function ProjectThumb({ project, className = "size-10" }: { project: Project; className?: string }) {
  return (
    <span
      className={`relative block shrink-0 overflow-hidden rounded-sm border border-white/10 ${className}`}
      style={{ background: `linear-gradient(135deg, ${project.accentColor}55, #141414)` }}
    >
      {project.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny admin swatch; next/image would add a round-trip per row
        <img src={project.thumbnail} alt="" width={40} height={40} loading="lazy" draggable={false} className="size-full object-cover" />
      ) : null}
    </span>
  );
}

/** Tiny 🎬 🎥 ✂️ credit glyphs for dense admin rows. */
export function CreditGlyphs({ project }: { project: Project }) {
  const c = projectCredits(project);
  const items = [
    { on: c.filmed, icon: "🎬", label: "Filmed" },
    { on: c.directed, icon: "🎥", label: "Directed" },
    { on: c.edited, icon: "✂️", label: "Edited" },
  ].filter((i) => i.on);
  if (!items.length) return null;
  return (
    <span className="flex shrink-0 gap-0.5 text-[10px] leading-none" aria-label={items.map((i) => i.label).join(", ")}>
      {items.map((i) => (
        <span key={i.label} title={i.label}>
          {i.icon}
        </span>
      ))}
    </span>
  );
}

/** One row in a category's list. Click → edit. */
export default function ProjectCard({ project, onEdit }: { project: Project; onEdit: () => void }) {
  return (
    <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left">
      <ProjectThumb project={project} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-white/90">{project.title}</span>
          {project.category === "ai" && <AiChip />}
          {project.featured && (
            <span title="Featured" className="text-[10px] text-[#e7fe55]">
              ★
            </span>
          )}
          <CreditGlyphs project={project} />
          {project.thumbnail && project.thumbnailSource && <SourceChip source={project.thumbnailSource} />}
        </span>
        <span className="block truncate font-mono text-[10px] uppercase tracking-widest text-white/40">
          {project.client || "—"} · {project.year} · {project.duration} · {project.orientation === "vertical" ? "9:16" : "16:9"}
          {!project.videoUrl && " · no video"}
        </span>
      </span>
    </button>
  );
}
