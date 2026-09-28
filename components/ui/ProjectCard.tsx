"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import Placeholder from "@/components/ui/Placeholder";
import Timecode from "@/components/ui/Timecode";
import { getCategory } from "@/data/categories";
import { projectHref, type Project } from "@/data/projects";
import { cn, pad } from "@/lib/utils";

type ProjectCardProps = {
  project: Project;
  index: number;
  size?: "md" | "lg";
  className?: string;
};

// Deterministic bar heights/delays so server and client markup match.
const BARS = Array.from({ length: 28 }, (_, i) => ({
  height: 30 + ((i * 53) % 70),
  delay: ((i * 37) % 100) / 100,
}));

/**
 * Orientation-aware project card. Vertical (9:16) is the default; horizontal
 * work renders 16:9. Hover plays a fake preview: tinted moving gradient,
 * waveform and a running timecode in the project's accent colour.
 */
export default function ProjectCard({ project, index, size = "md", className }: ProjectCardProps) {
  const [hovered, setHovered] = useState(false);
  const category = getCategory(project.category);
  const vertical = project.orientation === "vertical";
  const style = { "--p-accent": project.accentColor } as CSSProperties;

  return (
    <Link
      href={projectHref(project)}
      data-cursor="view"
      data-cursor-label={vertical ? "9:16" : "16:9"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={style}
      className={cn("group block", className)}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-sm bg-bg-soft transition-shadow duration-700 group-hover:shadow-[0_0_80px_-20px_var(--p-accent)]",
          vertical ? "aspect-[9/16]" : "aspect-video",
        )}
      >
        <div className="absolute inset-0 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.02]">
          <Placeholder
            title={project.title}
            seed={index}
            image={project.thumbnail || undefined}
            size={vertical && size === "md" ? "sm" : "lg"}
          />
        </div>

        {/* Hover preview */}
        <div
          aria-hidden
          className="anim-gradient absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            backgroundImage:
              "radial-gradient(80% 60% at 30% 20%, color-mix(in srgb, var(--p-accent) 22%, transparent), transparent 70%), radial-gradient(70% 60% at 80% 90%, color-mix(in srgb, var(--p-accent) 12%, transparent), transparent 70%), linear-gradient(160deg, #161616, #0a0a0a)",
          }}
        >
          <div className="absolute inset-x-4 bottom-[28%] flex h-10 items-end justify-between md:inset-x-6">
            {BARS.map((bar, i) => (
              <span
                key={i}
                className="wave-bar w-[3px] rounded-full opacity-70"
                style={{
                  height: `${bar.height}%`,
                  animationDelay: `-${bar.delay}s`,
                  background: "var(--p-accent)",
                }}
              />
            ))}
          </div>
        </div>

        <div className="absolute inset-x-0 top-0 flex justify-between p-4 font-mono text-[10px] uppercase tracking-widest text-muted md:p-5">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-accent-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            {pad(index + 1)}
          </span>
          <span className="transition-colors duration-300 group-hover:text-[var(--p-accent)]">
            {hovered ? <Timecode running fields={3} /> : project.duration}
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-bg/90 via-bg/40 to-transparent p-4 pt-20 md:p-5 md:pt-24">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted">
            {category?.name ?? project.category}
          </p>
          <div className="overflow-hidden">
            <h3
              className={cn(
                "font-black uppercase leading-[0.95] tracking-tight transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] md:translate-y-full md:group-hover:translate-y-0",
                size === "lg" ? "text-3xl md:text-5xl" : "text-xl md:text-2xl",
              )}
            >
              {project.title}
            </h3>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-widest text-muted transition-[opacity,transform] duration-500 md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100">
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
