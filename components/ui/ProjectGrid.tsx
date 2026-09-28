import ProjectCard from "@/components/ui/ProjectCard";
import Reveal from "@/components/ui/Reveal";
import type { Project } from "@/data/projects";

/** Vertical-first grid: 9:16 work leads, any 16:9 work follows in its own row. */
export default function ProjectGrid({ projects }: { projects: Project[] }) {
  const vertical = projects.filter((p) => p.orientation === "vertical");
  const horizontal = projects.filter((p) => p.orientation === "horizontal");

  return (
    <div className="flex flex-col gap-16 md:gap-24">
      {vertical.length > 0 && (
        <Reveal stagger className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
          {vertical.map((project) => (
            <ProjectCard key={project.id} project={project} index={projects.indexOf(project)} />
          ))}
        </Reveal>
      )}
      {horizontal.length > 0 && (
        <div>
          <p className="mb-6 font-mono text-[10px] uppercase tracking-widest text-muted">(16:9) Horizontal</p>
          <Reveal stagger className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {horizontal.map((project) => (
              <ProjectCard key={project.id} project={project} index={projects.indexOf(project)} />
            ))}
          </Reveal>
        </div>
      )}
    </div>
  );
}
