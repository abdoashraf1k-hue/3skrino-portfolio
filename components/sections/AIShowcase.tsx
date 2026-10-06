import Link from "next/link";
import BentoGrid from "@/components/ui/BentoGrid";
import { projectBentoItems } from "@/components/ui/projectBento";
import Reveal from "@/components/ui/Reveal";
import SectionHeader from "@/components/ui/SectionHeader";
import { aiProjects } from "@/data/projects";
import { T } from "@/lib/brand";
import { staticNumber } from "@/lib/brand-core";
import { CONTAINER } from "@/lib/utils";

/** Home: AI Cuts — generated sequences, directed and cut like real productions. */
export default function AIShowcase() {
  const aiWork = aiProjects.slice(0, staticNumber("home.aiCount"));

  return (
    <section id="ai-cuts" data-section="AI Cuts" data-cat="ai" className="py-16 md:py-24">
      <div className={CONTAINER}>
        <SectionHeader textKey="home.ai" />

        <div className="grid grid-cols-12 gap-x-6 gap-y-12">
          <Reveal stagger className="col-span-12 flex flex-col justify-between gap-10 lg:col-span-5">
            <p className="max-w-lg text-lg leading-relaxed text-muted md:text-xl">
              <T k="home.ai.blurb" />
            </p>
            <div className="flex flex-col gap-8">
              <ul className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest text-muted">
                {["Sora", "Runway", "Kling", "Midjourney", "ElevenLabs", "Higgsfield"].map((tool) => (
                  <li key={tool} className="border border-line px-3 py-1.5 transition-colors duration-300 hover:border-cat hover:text-cat">
                    {tool}
                  </li>
                ))}
              </ul>
              <Link
                href="/ai-cuts"
                className="w-fit border border-fg px-8 py-4 font-mono text-[11px] uppercase tracking-widest transition-colors duration-300 hover:bg-fg hover:text-bg"
              >
                All AI cuts →
              </Link>
            </div>
          </Reveal>

          {/* 3 columns: two tall + two small tiles pack this narrow column with no holes */}
          <BentoGrid items={projectBentoItems(aiWork)} columns={3} gap={3} className="col-span-12 lg:col-span-7" />
        </div>
      </div>
    </section>
  );
}
