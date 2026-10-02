import Link from "next/link";
import type { CSSProperties } from "react";
import Placeholder from "@/components/ui/Placeholder";
import ProjectBadges from "@/components/ui/ProjectBadges";
import { getCategory } from "@/data/categories";
import { projectHref, type Project } from "@/data/projects";
import { cn, pad } from "@/lib/utils";

type ProjectCardProps = {
  project: Project;
  index: number;
  size?: "md" | "lg";
  className?: string;
};

/**
 * Orientation-aware project card. Vertical (9:16) is the default; horizontal
 * work renders 16:9. Hover: slight zoom, soft darkening with a diagonal light
 * sweep in the project accent, title and meta rise in.
 */
export default function ProjectCard({ project, index, size = "md", className }: ProjectCardProps) {
  const category = getCategory(project.category);
  const vertical = project.orientation === "vertical";
  const style = { "--p-accent": project.accentColor } as CSSProperties;

  return (
    <Link
      href={projectHref(project)}
      style={style}
      data-track="project"
      data-track-id={project.id}
      className={cn("group block", className)}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-sm bg-bg-soft transition-shadow duration-700 group-hover:shadow-[0_0_80px_-20px_color-mix(in_srgb,var(--p-accent)_20%,transparent)]",
          vertical ? "aspect-[9/16]" : "aspect-video",
        )}
      >
        <div className="absolute inset-0 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.02]">
          <Placeholder
            title={project.title}
            seed={index}
            image={project.thumbnail || undefined}
            accent={project.accentColor}
            sizes={
              vertical
                ? "(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
                : "(min-width: 1024px) 60vw, 100vw"
            }
            size={vertical && size === "md" ? "sm" : "lg"}
          />
        </div>

        {/* Hover: soft darkening + a light sweep from bottom-left to top-right */}
        <div aria-hidden className="absolute inset-0 bg-bg/40 opacity-0 transition-opacity duration-400 group-hover:opacity-100" />
        <div
          aria-hidden
          className="absolute inset-0 -translate-x-full translate-y-full opacity-0 blur-2xl transition-[transform,opacity] duration-800 ease-out group-hover:translate-x-full group-hover:-translate-y-full group-hover:opacity-100"
          style={{
            backgroundImage:
              "linear-gradient(45deg, transparent 30%, color-mix(in srgb, var(--p-accent) 15%, transparent) 50%, transparent 70%)",
          }}
        />

        <div className="absolute inset-x-0 top-0 flex justify-between p-4 font-mono text-[10px] uppercase tracking-widest text-muted md:p-5">
          <span className="flex items-center gap-1">
            {pad(index + 1)}
            <span
              aria-hidden
              className="-translate-x-1 text-accent opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0 group-hover:opacity-100"
            >
              ↗
            </span>
          </span>
          <span className="transition-colors duration-300 group-hover:text-[var(--p-accent)]">{project.duration}</span>
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-bg/90 via-bg/40 to-transparent p-4 pt-20 md:p-5 md:pt-24">
          <ProjectBadges filmed={project.filmed} directed={project.directed} edited={project.edited} className="mb-3" />
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted">
            <span
              aria-hidden
              className="inline-block max-w-0 overflow-hidden whitespace-pre align-bottom text-accent opacity-0 transition-[max-width,opacity] duration-300 group-hover:max-w-8 group-hover:opacity-100"
            >
              {"// "}
            </span>
            {category?.name ?? project.category}
          </p>
          <div className="overflow-hidden">
            <h3
              className={cn(
                "font-black uppercase leading-[0.95] tracking-tight transition-transform duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] md:translate-y-full md:group-hover:translate-y-0",
                size === "lg" ? "text-3xl md:text-5xl" : "text-xl md:text-2xl",
              )}
            >
              {project.title}
            </h3>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-widest text-muted transition-[opacity,transform] duration-400 md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100">
            <span className="truncate">
              {project.year} • {project.client} • {project.duration}
            </span>
            <span className="shrink-0 text-sm text-[var(--p-accent)] transition-transform duration-300 group-hover:translate-x-1">
              →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
