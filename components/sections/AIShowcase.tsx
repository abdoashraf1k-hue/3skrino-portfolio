import Link from "next/link";
import Placeholder from "@/components/ui/Placeholder";
import Reveal from "@/components/ui/Reveal";
import SectionHeader from "@/components/ui/SectionHeader";
import { projects, projectHref } from "@/data/projects";
import { CONTAINER } from "@/lib/utils";

export default function AIShowcase() {
  const aiWork = projects.filter((p) => p.category === "ai").slice(0, 4);

  return (
    <section id="ai" className="border-b border-line py-20 md:py-32">
      <div className={CONTAINER}>
        <SectionHeader
          index="05"
          label="AI work"
          lines={[{ text: "Future", italic: true }, "Formats."]}
        />

        <div className="grid grid-cols-12 gap-x-6 gap-y-12">
          <Reveal stagger className="col-span-12 flex flex-col justify-between gap-10 lg:col-span-5">
            <p className="max-w-lg text-lg leading-relaxed text-muted md:text-xl">
              Beyond traditional editing — I direct AI-generated sequences for brands
              that want to push visual language further. From concept to final cut,
              using the latest generative tools.
            </p>
            <div className="flex flex-col gap-8">
              <ul className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest text-muted">
                {["Sora", "Runway", "Kling", "Midjourney", "ElevenLabs"].map((tool) => (
                  <li key={tool} className="border border-line px-3 py-1.5">
                    {tool}
                  </li>
                ))}
              </ul>
              <Link
                href="/ai"
                className="w-fit border border-fg px-8 py-4 font-mono text-[11px] uppercase tracking-widest transition-colors duration-300 hover:bg-fg hover:text-bg"
              >
                See AI work →
              </Link>
            </div>
          </Reveal>

          <Reveal stagger className="col-span-12 grid grid-cols-2 gap-3 sm:grid-cols-4 md:gap-4 lg:col-span-7">
            {aiWork.map((project, i) => (
              <Link
                key={project.id}
                href={projectHref(project)}
                className="group block"
              >
                <div className="relative aspect-[9/16] overflow-hidden rounded-sm bg-bg-soft">
                  <div className="absolute inset-0 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.02]">
                    <Placeholder title={project.title} seed={i + 1} size="sm" />
                  </div>
                  <span className="absolute left-3 top-3 font-mono text-[9px] uppercase tracking-widest text-accent md:left-4 md:top-4">
                    ● AI
                  </span>
                </div>
                <p className="mt-3 flex justify-between gap-2 font-mono text-[10px] uppercase tracking-widest text-muted">
                  <span className="truncate text-fg">{project.title}</span>
                  <span className="hidden sm:inline">{project.tools[0]}</span>
                </p>
              </Link>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
