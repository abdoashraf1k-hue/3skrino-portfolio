"use client";

import { useEffect, useRef } from "react";
import ProjectCard from "@/components/ui/ProjectCard";
import Reveal from "@/components/ui/Reveal";
import type { Project } from "@/data/projects";
import { gsap } from "@/lib/gsap";
import { RICH_MOTION_QUERY } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const COLUMNS = 4;
/** Resting stagger per column (±40px rhythm). */
const OFFSETS = ["lg:pt-0", "lg:pt-10", "lg:pt-5", "lg:pt-16"];
/** Scroll parallax per column, px. Spec ratios [0, -30, -15, -45] doubled so they read at desktop scale. */
const PARALLAX = [0, -60, -30, -90];

export default function VerticalMasonry({ projects }: { projects: Project[] }) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Round-robin into columns so reading order stays left → right.
  const columns = Array.from({ length: COLUMNS }, (_, c) => projects.filter((_, i) => i % COLUMNS === c));

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const mm = gsap.matchMedia();
    mm.add(RICH_MOTION_QUERY, () => {
      root.querySelectorAll<HTMLElement>("[data-column]").forEach((col, i) => {
        if (!PARALLAX[i]) return;
        gsap.fromTo(
          col,
          { y: 0 },
          {
            y: PARALLAX[i],
            ease: "none",
            scrollTrigger: { trigger: root, start: "top bottom", end: "bottom top", scrub: true },
          },
        );
      });
    });
    return () => mm.revert();
  }, []);

  return (
    <div ref={rootRef} className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-4">
      {columns.map((column, c) => (
        <div key={c} data-column className={cn("flex flex-col gap-4 md:gap-6", OFFSETS[c])}>
          {column.map((project) => (
            <Reveal key={project.id}>
              <ProjectCard project={project} index={projects.indexOf(project)} />
            </Reveal>
          ))}
        </div>
      ))}
    </div>
  );
}
