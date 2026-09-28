"use client";

import { useEffect, useRef, useState } from "react";
import type { Project } from "@/data/projects";
import ProjectCard from "./ProjectCard";

type Props = {
  projects: Project[];
  onEdit: (project: Project) => void;
  /** Called with this category's ids in their new order. */
  onReorder: (ids: string[]) => void;
};

const DRAG_TYPE = "application/x-3skrino-project";
const LONG_PRESS_MS = 450;

function move<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Native HTML5 drag & drop within one category. Touch devices (where native
 * DnD is unreliable) get a long-press menu with Move up / Move down instead;
 * keyboard users get Alt+↑ / Alt+↓.
 */
export default function SortableList({ projects, onEdit, onReorder }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null); // insertion index 0..n
  const [menuId, setMenuId] = useState<string | null>(null);
  const pressTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const listRef = useRef<HTMLUListElement>(null);

  const ids = projects.map((p) => p.id);

  const commit = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || to >= ids.length) return;
    onReorder(move(ids, from, to));
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

  if (projects.length === 0) {
    return <p className="py-3 font-mono text-[10px] uppercase tracking-widest text-white/25">No projects yet</p>;
  }

  return (
    <ul ref={listRef} className="flex flex-col" onDragLeave={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropAt(null);
    }}>
      {projects.map((project, index) => {
        const isDragging = dragId === project.id;
        return (
          <li
            key={project.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, project.id);
              e.dataTransfer.effectAllowed = "move";
              setDragId(project.id);
              setMenuId(null);
            }}
            onDragEnd={() => {
              setDragId(null);
              setDropAt(null);
            }}
            onDragOver={(e) => {
              if (!dragId || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const rect = e.currentTarget.getBoundingClientRect();
              setDropAt(e.clientY < rect.top + rect.height / 2 ? index : index + 1);
            }}
            onDrop={(e) => {
              if (!dragId || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
              e.preventDefault();
              e.stopPropagation();
              const from = ids.indexOf(dragId);
              const insert = dropAt ?? index;
              // Removing the item first shifts later slots up by one.
              commit(from, insert > from ? insert - 1 : insert);
              setDragId(null);
              setDropAt(null);
            }}
            onPointerDown={(e) => {
              if (e.pointerType === "mouse") return;
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
            className={`relative flex select-none items-center gap-2 border-t border-white/5 [-webkit-touch-callout:none] first:border-t-0 ${
              isDragging ? "opacity-40" : ""
            }`}
          >
            {/* Drop indicator line — before this row, or after the last one. */}
            {dropAt === index && dragId && <span className="pointer-events-none absolute inset-x-0 -top-px h-0.5 bg-[#e7fe55]" />}
            {dropAt === index + 1 && index === projects.length - 1 && dragId && (
              <span className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 bg-[#e7fe55]" />
            )}

            <span aria-hidden className="cursor-grab px-1 font-mono text-xs text-white/20 active:cursor-grabbing">
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
