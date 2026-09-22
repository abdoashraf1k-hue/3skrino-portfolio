import Link from "next/link";
import Placeholder from "@/components/ui/Placeholder";
import { getCategory } from "@/data/categories";
import { projectHref, type Project } from "@/data/projects";
import { cn } from "@/lib/utils";

type ProjectCardProps = {
  project: Project;
  index: number;
  className?: string;
};

export default function ProjectCard({ project, index, className }: ProjectCardProps) {
  const category = getCategory(project.category);

  return (
    <Link href={projectHref(project)} data-hover className={cn("group block", className)}>
      <div className="relative aspect-video overflow-hidden rounded-sm bg-bg-soft">
        <div className="absolute inset-0 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.02]">
          <Placeholder title={project.title} seed={index} image={project.thumbnail || undefined} />
        </div>

        <div className="absolute inset-x-0 top-0 flex justify-between p-4 font-mono text-[10px] uppercase tracking-widest text-muted md:p-6">
          <span>{String(index + 1).padStart(2, "0")}</span>
          <span className="tabular-nums">{project.duration}</span>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-linear-to-t from-bg/80 to-transparent p-4 pt-16 md:p-6 md:pt-20">
          <div>
            <h3 className="text-xl font-black uppercase tracking-tight md:text-2xl">{project.title}</h3>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted">
              {category?.name ?? project.category} — {project.year}
            </p>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted transition-all duration-300 group-hover:translate-x-1 group-hover:text-accent">
            View →
          </span>
        </div>
      </div>
    </Link>
  );
}
