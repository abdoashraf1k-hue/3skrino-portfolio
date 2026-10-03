"use client";

import { useState, type CSSProperties } from "react";
import { categories } from "@/data/categories";
import type { Project } from "@/data/projects";
import { assertUploadable } from "@/lib/admin/video-upload";
import DropZone, { isFileDrag } from "./DropZone";
import { AiChip, ProjectThumb } from "./ProjectCard";
import SortableList from "./SortableList";

type Props = {
  /** Projects to show (already filtered). */
  projects: Project[];
  /** True while any filter is on: empty categories hide and reordering locks. */
  filtering: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (ids: string[], on: boolean) => void;
  onNew: (category: string, file?: File) => void;
  onEdit: (project: Project) => void;
  onReorder: (category: string, ids: string[]) => void;
  onMoveIn: (id: string, category: string, index: number) => void;
  onError: (message: string) => void;
  onQuickEdit?: (id: string, patch: { title: string; year: number }) => Promise<void>;
  onPreview?: (project: Project | null) => void;
};

/**
 * One card per category: 3 cols desktop, 2 tablet, 1 mobile.
 * Stagger: cards rise in 80ms apart — the same 0.08s rhythm as the site's
 * Categories — Fields grid (see SCROLL_BLUEPRINTS.md).
 */
export default function CategoryGrid(props: Props) {
  const { projects, filtering } = props;
  const shown = categories
    .map((c) => ({ ...c, items: projects.filter((p) => p.category === c.id) }))
    .filter((c) => !filtering || c.items.length > 0);

  if (!shown.length) {
    return <p className="py-24 text-center font-mono text-[11px] uppercase tracking-widest text-white/40">No projects match these filters</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 min-[1920px]:grid-cols-3">
      {shown.map((category, i) => (
        <CategoryCard key={category.id} index={i} id={category.id} name={category.name} items={category.items} {...props} />
      ))}
    </div>
  );
}

type CardProps = Props & { index: number; id: string; name: string; items: Project[] };

function CategoryCard({
  index,
  id,
  name,
  items,
  filtering,
  selected,
  onToggleSelect,
  onSelectAll,
  onNew,
  onEdit,
  onReorder,
  onMoveIn,
  onError,
  onQuickEdit,
  onPreview,
}: CardProps) {
  const [fileOver, setFileOver] = useState(false);
  const allSelected = items.length > 0 && items.every((p) => selected.has(p.id));

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
          <p className="mt-0.5 flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-white/40">
            {items.length} {items.length === 1 ? "project" : "projects"}
            {items.length > 0 && (
              <label className="flex items-center gap-1.5 text-white/30 hover:text-white/60">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) =>
                    onSelectAll(
                      items.map((p) => p.id),
                      e.target.checked,
                    )
                  }
                  className="size-3 accent-[#e7fe55]"
                />
                all
              </label>
            )}
          </p>
        </div>
        <div className="flex shrink-0 -space-x-2">
          {items.slice(0, 4).map((p) => (
            <ProjectThumb key={p.id} project={p} className="size-10 ring-2 ring-[#0d0d0d]" />
          ))}
        </div>
      </header>

      <div className="flex-1">
        <SortableList
          category={id}
          projects={items}
          onEdit={onEdit}
          onReorder={(ids) => onReorder(id, ids)}
          onMoveIn={(projectId, at) => onMoveIn(projectId, id, at)}
          reorderable={!filtering}
          selected={selected}
          onToggleSelect={onToggleSelect}
          onQuickEdit={onQuickEdit}
          onPreview={onPreview}
        />
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
