"use client";

import { useEffect, useRef } from "react";
import ProjectCard from "@/components/ui/ProjectCard";
import type { Project } from "@/data/projects";
import { gsap } from "@/lib/gsap";
import { RICH_MOTION_QUERY } from "@/lib/hooks";

/**
 * Sticky stack: each 16:9 film pins below the nav and the next one slides
 * over it, while the covered card eases back slightly. One or two films are
 * on screen at a time.
 */
export default function HorizontalStack({ projects }: { projects: Project[] }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const mm = gsap.matchMedia();
    mm.add(RICH_MOTION_QUERY, () => {
      const cards = root.querySelectorAll<HTMLElement>("[data-stack-card]");
      cards.forEach((card, i) => {
        const next = cards[i + 1];
        if (!next) return;
        gsap.to(card, {
          scale: 0.94,
          opacity: 0.35,
          ease: "none",
          scrollTrigger: { trigger: next, start: "top bottom", end: "top 20%", scrub: true },
        });
      });
    });
    return () => mm.revert();
  }, []);

  return (
    <div ref={rootRef} className="flex flex-col gap-[12svh]">
      {projects.map((project, i) => (
        <div
          key={project.id}
          className="md:sticky"
          style={{ top: `calc(6rem + ${i * 1.25}rem)` }}
        >
          <div data-stack-card className="mx-auto w-full max-w-[min(100%,calc((100svh-10rem)*16/9))] origin-top">
            <ProjectCard project={project} index={i} size="lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
