"use client";

import { useState, type CSSProperties } from "react";
import { categories } from "@/data/categories";
import type { Project } from "@/data/projects";
import { assertUploadable } from "@/lib/admin/cloudinary";
import DropZone, { isFileDrag } from "./DropZone";
import { AiChip, ProjectThumb } from "./ProjectCard";
import SortableList from "./SortableList";

type Props = {
  projects: Project[];
  onNew: (category: string, file?: File) => void;
  onEdit: (project: Project) => void;
  onReorder: (category: string, ids: string[]) => void;
  onError: (message: string) => void;
};

/**
 * One card per category: 3 cols desktop, 2 tablet, 1 mobile.
 * Stagger: cards rise in 80ms apart — the same 0.08s rhythm as the site's
 * Categories — Fields grid (see SCROLL_BLUEPRINTS.md).
 */
export default function CategoryGrid({ projects, onNew, onEdit, onReorder, onError }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {categories.map((category, i) => (
        <CategoryCard
          key={category.id}
          index={i}
          id={category.id}
          name={category.name}
          projects={projects.filter((p) => p.category === category.id)}
          onNew={onNew}
          onEdit={onEdit}
          onReorder={onReorder}
          onError={onError}
        />
      ))}
    </div>
  );
}

type CardProps = Omit<Props, "projects"> & { index: number; id: string; name: string; projects: Project[] };

function CategoryCard({ index, id, name, projects, onNew, onEdit, onReorder, onError }: CardProps) {
  const [fileOver, setFileOver] = useState(false);

  return (
    <section
      style={{ "--i": index } as CSSProperties}
      // The whole card accepts a video drop, not just the dashed strip.
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setFileOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileOver(false);
      }}
      onDrop={(e) => {
        setFileOver(false);
        if (!isFileDrag(e) || e.defaultPrevented) return;
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (!file) return;
        try {
          assertUploadable(file);
          onNew(id, file);
        } catch (err) {
          onError(err instanceof Error ? err.message : "That file can't be uploaded");
        }
      }}
      className={`admin-stagger flex flex-col border bg-[#0d0d0d] p-5 transition-colors ${
        fileOver ? "border-[#e7fe55]" : "border-white/10 hover:border-white/20"
      }`}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/30">{String(index + 1).padStart(2, "0")}</p>
          <h2 className="mt-1 flex items-center gap-2 truncate text-xl font-black uppercase tracking-tight">
            {name}
            {id === "ai" && <AiChip />}
          </h2>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-white/40">
            {projects.length} {projects.length === 1 ? "project" : "projects"}
          </p>
        </div>
        <div className="flex shrink-0 -space-x-2">
          {projects.slice(0, 4).map((p) => (
            <ProjectThumb key={p.id} project={p} className="size-10 ring-2 ring-[#0d0d0d]" />
          ))}
        </div>
      </header>

      <div className="flex-1">
        <SortableList projects={projects} onEdit={onEdit} onReorder={(ids) => onReorder(id, ids)} />
      </div>

      <div className="mt-4 flex gap-2">
        <DropZone onFile={(file) => onNew(id, file)} onError={onError} className="flex-1" />
        <button
          type="button"
          onClick={() => onNew(id)}
          title="New project without a video"
          className="shrink-0 border border-white/15 px-3 font-mono text-[11px] uppercase tracking-widest text-white/60 hover:border-white/40 hover:text-white"
        >
          + New
        </button>
      </div>
    </section>
  );
}
