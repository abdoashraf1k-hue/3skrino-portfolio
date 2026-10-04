import Link from "next/link";
import type { CSSProperties } from "react";
import type { BentoAspect } from "@/components/ui/BentoGrid";
import HoverPreview from "@/components/ui/HoverPreview";
import Placeholder from "@/components/ui/Placeholder";
import ProjectBadges from "@/components/ui/ProjectBadges";
import { getCategory } from "@/data/categories";
import { projectHref, type Project } from "@/data/projects";
import { cn, pad } from "@/lib/utils";

type ProjectCardProps = {
  project: Project;
  index: number;
  size?: "md" | "lg";
  /**
   * Bento tile shape. When set, the card fills its parent instead of keeping
   * its own 9:16 / 16:9 box, and sizes its image + title for that span.
   */
  aspect?: BentoAspect;
  className?: string;
};

/** The stock project accent — such projects wear their category colour. */
const DEFAULT_ACCENT = "#e7fe55";

const BENTO_SIZES: Record<BentoAspect, string> = {
  square: "(min-width: 1024px) 50vw, 100vw",
  wide: "(min-width: 1024px) 50vw, 100vw",
  tall: "(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 100vw",
  small: "(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 100vw",
};

/**
 * Orientation-aware project card. Vertical (9:16) is the default; horizontal
 * work renders 16:9. Hover: slight zoom, soft darkening with a diagonal light
 * sweep in the project accent, title and meta rise in.
 */
export default function ProjectCard({ project, index, size: sizeProp = "md", aspect, className }: ProjectCardProps) {
  const category = getCategory(project.category);
  const vertical = project.orientation === "vertical";
  const size = aspect === "square" ? "lg" : sizeProp;
  // A project with the default lime accent takes its category's signature colour instead.
  const accent = project.accentColor.toLowerCase() === DEFAULT_ACCENT ? "var(--cat)" : project.accentColor;
  const style = { "--p-accent": accent } as CSSProperties;

  return (
    <Link
      href={projectHref(project)}
      style={style}
      data-cat={project.category}
      data-track="project"
      data-track-id={project.id}
      data-lut-project={project.id}
      className={cn("group block", aspect && "size-full", className)}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-[var(--radius-card)] bg-bg-soft transition-shadow duration-700 group-hover:shadow-[0_0_80px_-20px_color-mix(in_srgb,var(--p-accent)_25%,transparent)]",
          project.featured && "card-featured",
          aspect ? "size-full" : vertical ? "aspect-[9/16]" : "aspect-video",
        )}
      >
        <div className="absolute inset-0 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.02]">
          <Placeholder
            title={project.title}
            seed={index}
            image={project.thumbnail || undefined}
            accent={project.accentColor}
            sizes={
              aspect
                ? BENTO_SIZES[aspect]
                : vertical
                  ? "(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
                  : "(min-width: 1024px) 60vw, 100vw"
            }
            size={aspect ? (aspect === "square" || aspect === "wide" ? "lg" : "sm") : vertical && size === "md" ? "sm" : "lg"}
          />
        </div>

        {/* Hover: soft darkening + a light sweep from bottom-left to top-right */}
        <div aria-hidden className="absolute inset-0 bg-bg/40 opacity-0 transition-opacity duration-400 group-hover:opacity-100" />
        {/* …and the clip itself, above the darkening (desktop pointers only). */}
        {project.videoUrl && <HoverPreview src={project.videoUrl} />}
        <div
          aria-hidden
          className="absolute inset-0 -translate-x-full translate-y-full opacity-0 blur-2xl transition-[transform,opacity] duration-800 ease-out group-hover:translate-x-full group-hover:-translate-y-full group-hover:opacity-100"
          style={{
            backgroundImage:
              "linear-gradient(45deg, transparent 30%, color-mix(in srgb, var(--p-accent) 15%, transparent) 50%, transparent 70%)",
          }}
        />

        <div className="absolute inset-x-0 top-0 flex justify-between p-4 font-mono text-[10px] uppercase tracking-widest text-muted md:p-5">
          <span className="flex items-center gap-1.5">
            <span className="rounded-[3px] border border-fg/20 bg-bg/50 px-1.5 py-0.5 tabular-nums text-fg/80 backdrop-blur-sm transition-colors duration-300 group-hover:border-[var(--p-accent)] group-hover:text-[var(--p-accent)]">
              {pad(index + 1)}
            </span>
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
          <p className="mb-2 flex items-center font-mono text-[10px] uppercase tracking-widest text-muted">
            <span aria-hidden className="mr-2 size-1.5 shrink-0 rounded-full bg-cat" />
            <span
              aria-hidden
              className="inline-block max-w-0 overflow-hidden whitespace-pre align-bottom text-cat opacity-0 transition-[max-width,opacity] duration-300 group-hover:max-w-8 group-hover:opacity-100"
            >
              {"// "}
            </span>
            <span className="transition-colors duration-300 group-hover:text-cat">{category?.name ?? project.category}</span>
          </p>
          <div className="overflow-hidden">
            <h3
              className={cn(
                "type-label leading-[0.95] transition-transform duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] md:translate-y-full md:group-hover:translate-y-0",
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
