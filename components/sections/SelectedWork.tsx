import Link from "next/link";
import ProjectCard from "@/components/ui/ProjectCard";
import Reveal from "@/components/ui/Reveal";
import SectionHeader from "@/components/ui/SectionHeader";
import { projects } from "@/data/projects";
import { CONTAINER, cn } from "@/lib/utils";

// Asymmetric 7 / 5 / 5 / 7 rhythm on the 12-col grid.
const SPANS = ["lg:col-span-7", "lg:col-span-5", "lg:col-span-5", "lg:col-span-7"];

export default function SelectedWork() {
  const featured = projects.filter((p) => p.featured).slice(0, 4);

  return (
    <section id="work" className="border-b border-line py-24 md:py-40">
      <div className={CONTAINER}>
        <SectionHeader
          index="01"
          label="Selected work"
          lines={["Featured", "Projects"]}
          aside={
            <Link
              href="/work"
              className="font-mono text-[11px] uppercase tracking-widest text-muted transition-colors duration-300 hover:text-accent"
            >
              All work →
            </Link>
          }
        />

        <div className="grid grid-cols-12 gap-x-6 gap-y-12 md:gap-y-16">
          {featured.map((project, i) => (
            <Reveal key={project.id} className={cn("col-span-12", SPANS[i % SPANS.length])}>
              <ProjectCard project={project} index={i} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
