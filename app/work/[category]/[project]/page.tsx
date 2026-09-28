import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Placeholder from "@/components/ui/Placeholder";
import Reveal from "@/components/ui/Reveal";
import { getCategory } from "@/data/categories";
import { getProject, projectHref, projects } from "@/data/projects";
import { CONTAINER, cn } from "@/lib/utils";

export const dynamicParams = false;

export function generateStaticParams() {
  return projects.map((p) => ({ category: p.category, project: p.id }));
}

export async function generateMetadata(
  props: PageProps<"/work/[category]/[project]">,
): Promise<Metadata> {
  const { category, project } = await props.params;
  const data = getProject(category, project);
  return data ? { title: data.title, description: data.description } : {};
}

export default async function ProjectPage(props: PageProps<"/work/[category]/[project]">) {
  const { category: categoryId, project: projectId } = await props.params;
  const project = getProject(categoryId, projectId);
  const category = getCategory(categoryId);
  if (!project || !category) notFound();

  const i = projects.indexOf(project);
  const vertical = project.orientation === "vertical";
  const next = projects[(i + 1) % projects.length];

  const meta = [
    { label: "Client", value: project.client },
    { label: "Year", value: String(project.year) },
    { label: "Role", value: project.role },
    { label: "Tools", value: project.tools.join(", ") },
  ];

  return (
    <>
      <PageHeader
        label={
          <Link href={`/work/${category.id}`} className="transition-colors duration-300 hover:text-accent">
            ← Work / {category.name}
          </Link>
        }
        title={project.title}
      />

      <section id="project" className={cn(CONTAINER, "pb-24 md:pb-40")}>
        <Reveal>
          <div
            style={{ boxShadow: `0 0 120px -40px ${project.accentColor}` }}
            className={cn(
              "relative mx-auto overflow-hidden rounded-sm bg-bg-soft",
              vertical ? "aspect-[9/16] w-full max-w-[min(100%,calc(80svh*9/16))]" : "aspect-video w-full",
            )}
          >
            {project.videoUrl ? (
              <video
                src={project.videoUrl}
                poster={project.thumbnail || undefined}
                controls
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <>
                <Placeholder title={project.title} seed={i} size={vertical ? "sm" : "lg"} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="flex size-20 items-center justify-center rounded-full border border-fg/30 text-sm md:size-24">
                    ▶
                  </span>
                </div>
                <div className="absolute inset-x-0 bottom-0 flex justify-between p-4 font-mono text-[10px] uppercase tracking-widest text-muted md:p-6">
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-accent-2" />
                    Footage soon
                  </span>
                  <span className="tabular-nums" style={{ color: project.accentColor }}>
                    00:00 / {project.duration}
                  </span>
                </div>
              </>
            )}
          </div>
          <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-widest text-muted">
            {vertical ? "9:16 — Vertical" : "16:9 — Horizontal"}
          </p>
        </Reveal>

        <Reveal stagger className="mt-12 grid grid-cols-2 border-y border-line md:grid-cols-4">
          {meta.map((m, idx) => (
            <div
              key={m.label}
              className={cn(
                "py-6 md:py-8",
                idx % 2 === 0 ? "pr-4" : "pl-4 md:pl-6",
                idx >= 2 && "border-t border-line md:border-t-0",
                idx < meta.length - 1 && "md:border-r md:border-line",
                idx > 0 && "md:pl-6",
              )}
            >
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted">{m.label}</p>
              <p className="mt-2 text-base font-medium md:text-lg">{m.value}</p>
            </div>
          ))}
        </Reveal>

        <Reveal className="mt-16 grid grid-cols-12 gap-6 md:mt-24">
          <p className="col-span-12 font-mono text-[11px] uppercase tracking-widest text-muted md:col-span-4">
            (About the project)
          </p>
          <p className="col-span-12 max-w-2xl text-xl leading-relaxed md:col-span-8 md:text-2xl">
            {project.description}
          </p>
        </Reveal>
      </section>

      <Link
        href={projectHref(next)}
        data-hover
        className="group block border-t border-line"
      >
        <div className={cn(CONTAINER, "py-16 md:py-24")}>
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted">Next project →</p>
          <p className="mt-4 text-[clamp(2.5rem,8vw,8rem)] font-black uppercase leading-[0.9] tracking-tight transition-colors duration-300 group-hover:text-accent">
            {next.title}
          </p>
        </div>
      </Link>
    </>
  );
}
