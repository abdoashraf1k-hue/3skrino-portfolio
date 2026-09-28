"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import ProjectCard from "@/components/ui/ProjectCard";
import type { Category } from "@/data/categories";
import type { Project } from "@/data/projects";
import { cn, EASE_OUT } from "@/lib/utils";

type WorkGridProps = {
  projects: Project[];
  categories: Category[];
};

export default function WorkGrid({ projects, categories }: WorkGridProps) {
  const [active, setActive] = useState<string>("all");
  const filters = categories.filter((c) => projects.some((p) => p.category === c.id));
  const filtered = active === "all" ? projects : projects.filter((p) => p.category === active);
  // Vertical first; 16:9 pieces span two columns and gather at the end.
  const visible = [
    ...filtered.filter((p) => p.orientation === "vertical"),
    ...filtered.filter((p) => p.orientation === "horizontal"),
  ];

  const chip = (id: string, label: string, count: number) => (
    <button
      key={id}
      type="button"
      onClick={() => setActive(id)}
      aria-pressed={active === id}
      className={cn(
        "border px-4 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors duration-300",
        active === id
          ? "border-accent bg-accent text-bg"
          : "border-line text-muted hover:border-fg hover:text-fg",
      )}
    >
      {label} <span className="opacity-60">({count})</span>
    </button>
  );

  return (
    <>
      <div className="mb-12 flex flex-wrap gap-2 md:mb-16">
        {chip("all", "All", projects.length)}
        {filters.map((c) => chip(c.id, c.name, projects.filter((p) => p.category === c.id).length))}
      </div>

      <motion.div layout className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
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
    </>
  );
}
