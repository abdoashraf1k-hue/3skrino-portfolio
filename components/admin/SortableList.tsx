"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import type { Project } from "@/data/projects";
import ProjectCard from "./ProjectCard";

type Props = {
  category: string;
  projects: Project[];
  onEdit: (project: Project) => void;
  /** Called with this category's ids in their new order. */
  onReorder: (ids: string[]) => void;
  /** A row from ANOTHER category was dropped here at `index`. */
  onMoveIn: (id: string, index: number) => void;
  /** False while filters hide part of the list — a partial order can't be saved safely. */
  reorderable: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
};

const DRAG_TYPE = "application/x-3skrino-project";
const LONG_PRESS_MS = 450;

/** The row being dragged, visible to every list (dataTransfer can't be read during dragover). */
let active: { id: string; category: string } | null = null;

function move<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** A tilted, lifted clone as the drag image — the browser snapshots it once. */
function setGhost(e: DragEvent<HTMLElement>) {
  const row = e.currentTarget;
  const ghost = row.cloneNode(true) as HTMLElement;
  const rect = row.getBoundingClientRect();
  Object.assign(ghost.style, {
    position: "fixed",
    top: "-1000px",
    left: "-1000px",
    width: `${rect.width}px`,
    transform: "rotate(2deg)",
    opacity: "0.9",
    background: "#161616",
    boxShadow: "0 18px 40px rgba(0,0,0,0.6)",
    border: "1px solid rgba(231,254,85,0.35)",
    pointerEvents: "none",
  });
  document.body.appendChild(ghost);
  e.dataTransfer.setDragImage(ghost, e.clientX - rect.left, e.clientY - rect.top);
  window.setTimeout(() => ghost.remove(), 0);
}

/**
 * Native HTML5 drag & drop. Rows reorder within a category and can be dropped
 * into another category's list (which moves the project there). Touch devices
 * get a long-press menu with Move up / Move down; keyboard users Alt+↑ / Alt+↓.
 */
export default function SortableList({
  category,
  projects,
  onEdit,
  onReorder,
  onMoveIn,
  reorderable,
  selected,
  onToggleSelect,
}: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null); // insertion index 0..n
  const [menuId, setMenuId] = useState<string | null>(null);
  const pressTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const listRef = useRef<HTMLUListElement>(null);

  const ids = projects.map((p) => p.id);

  const commit = (from: number, to: number) => {
    if (!reorderable || from === to || from < 0 || to < 0 || to >= ids.length) return;
    onReorder(move(ids, from, to));
  };

  const drop = (insert: number) => {
    if (!active) return;
    if (active.category === category) {
      const from = ids.indexOf(active.id);
      // Removing the item first shifts later slots up by one.
      commit(from, insert > from ? insert - 1 : insert);
    } else {
      onMoveIn(active.id, insert);
    }
  };

  const cancelPress = () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  // Close the long-press menu on any outside tap.
  useEffect(() => {
    if (!menuId) return;
    const onDown = (e: PointerEvent) => {
      if (!listRef.current?.contains(e.target as Node)) setMenuId(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuId]);

  useEffect(
    () => () => {
      if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    },
    [],
  );

  const accepts = (e: DragEvent) => reorderable && e.dataTransfer.types.includes(DRAG_TYPE) && active !== null;

  if (projects.length === 0) {
    return (
      <p
        onDragOver={(e) => {
          if (!accepts(e)) return;
          e.preventDefault();
          setDropAt(0);
        }}
        onDragLeave={() => setDropAt(null)}
        onDrop={(e) => {
          if (!accepts(e)) return;
          e.preventDefault();
          e.stopPropagation();
          drop(0);
          setDropAt(null);
        }}
        className={`rounded-sm border border-dashed py-3 text-center font-mono text-[10px] uppercase tracking-widest transition-colors ${
          dropAt === 0 ? "border-[#e7fe55] text-[#e7fe55]" : "border-transparent text-white/25"
        }`}
      >
        {dropAt === 0 ? "Drop to move here" : "No projects yet"}
      </p>
    );
  }

  return (
    <ul
      ref={listRef}
      className="flex flex-col"
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropAt(null);
      }}
    >
      {projects.map((project, index) => {
        const isDragging = dragId === project.id;
        const isSelected = selected.has(project.id);
        return (
          <li
            key={project.id}
            draggable={reorderable}
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, project.id);
              e.dataTransfer.effectAllowed = "move";
              setGhost(e);
              active = { id: project.id, category };
              setDragId(project.id);
              setMenuId(null);
            }}
            onDragEnd={() => {
              active = null;
              setDragId(null);
              setDropAt(null);
            }}
            onDragOver={(e) => {
              if (!accepts(e)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const rect = e.currentTarget.getBoundingClientRect();
              setDropAt(e.clientY < rect.top + rect.height / 2 ? index : index + 1);
            }}
            onDrop={(e) => {
              if (!accepts(e)) return;
              e.preventDefault();
              e.stopPropagation();
              drop(dropAt ?? index);
              setDropAt(null);
            }}
            onPointerDown={(e) => {
              if (e.pointerType === "mouse" || !reorderable) return;
              suppressClick.current = false;
              cancelPress();
              pressTimer.current = window.setTimeout(() => {
                suppressClick.current = true;
                setMenuId(project.id);
              }, LONG_PRESS_MS);
            }}
            onPointerUp={cancelPress}
            onPointerCancel={cancelPress}
            onPointerLeave={cancelPress}
            onContextMenu={(e) => {
              if (!reorderable) return;
              // Android fires contextmenu on long-press; desktop right-click opens the same menu.
              e.preventDefault();
              cancelPress();
              suppressClick.current = e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType !== "mouse";
              setMenuId(project.id);
            }}
            onKeyDown={(e) => {
              if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
              e.preventDefault();
              commit(index, e.key === "ArrowUp" ? index - 1 : index + 1);
            }}
            className={`relative flex select-none items-center gap-2 border-t border-white/5 transition-[transform,opacity,box-shadow,background-color] duration-200 [-webkit-touch-callout:none] first:border-t-0 ${
              isDragging ? "z-10 rotate-2 bg-[#161616] opacity-70 shadow-[0_18px_40px_rgba(0,0,0,0.6)]" : ""
            } ${isSelected ? "bg-[#e7fe55]/[0.04]" : ""}`}
          >
            {/* Drop indicator — a thin lime line before this row, or after the last one. */}
            {dropAt === index && active && (
              <span className="pointer-events-none absolute inset-x-0 -top-px h-0.5 bg-[#e7fe55] shadow-[0_0_8px_#e7fe55]" />
            )}
            {dropAt === index + 1 && index === projects.length - 1 && active && (
              <span className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 bg-[#e7fe55] shadow-[0_0_8px_#e7fe55]" />
            )}

            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(project.id)}
              aria-label={`Select ${project.title}`}
              className="size-3.5 shrink-0 accent-[#e7fe55]"
            />
            <span
              aria-hidden
              className={`px-0.5 font-mono text-xs ${reorderable ? "cursor-grab text-white/20 active:cursor-grabbing" : "text-white/5"}`}
            >
              ⋮⋮
            </span>
            <ProjectCard
              project={project}
              onEdit={() => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                onEdit(project);
              }}
            />

            {menuId === project.id && (
              <div
                role="menu"
                className="admin-fade absolute right-0 top-full z-20 mt-1 flex min-w-40 flex-col border border-white/15 bg-[#141414] py-1 shadow-2xl"
              >
                {[
                  { label: "Move up", to: index - 1, disabled: index === 0 },
                  { label: "Move down", to: index + 1, disabled: index === projects.length - 1 },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      commit(index, item.to);
                      setMenuId(null);
                    }}
                    className="px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-widest text-white/80 hover:bg-white/5 disabled:text-white/20"
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuId(null);
                    onEdit(project);
                  }}
                  className="px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-widest text-white/80 hover:bg-white/5"
                >
                  Edit
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
