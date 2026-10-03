import type { Metadata } from "next";
import type { CSSProperties } from "react";
import PageHeader from "@/components/ui/PageHeader";
import ProjectGrid from "@/components/ui/ProjectGrid";
import Reveal from "@/components/ui/Reveal";
import SectionHeader from "@/components/ui/SectionHeader";
import { aiProjects } from "@/data/projects";
import { pageMetadata } from "@/lib/seo";
import { CONTAINER, pad } from "@/lib/utils";

export const metadata: Metadata = pageMetadata({
  title: "AI Cuts",
  description: "AI-generated films and sequences directed and edited by 3SKRINO.",
  path: "/ai-cuts",
});

const process = [
  { title: "Concept", text: "Treatment, references and a shot list — the same prep as a live shoot." },
  { title: "Look dev", text: "Style frames in Midjourney to lock palette, lensing and texture." },
  { title: "Generation", text: "Hundreds of takes across Sora, Runway, Kling and Higgsfield, curated like dailies." },
  { title: "Final cut", text: "Edit, grade, sound and AI voice — finished to broadcast standard." },
];

/** The page wears the AI category's signature colour as its accent. */
const tint = { "--accent": "var(--cat)", "--accent-ink": "var(--cat)" } as CSSProperties;

export default function AICutsPage() {
  return (
    <div data-cat="ai" style={tint}>
      <PageHeader
        label="(03) Generative"
        title={
          <>
            <span className="italic text-accent">AI</span> Cuts
          </>
        }
        description="Generated sequences directed like real productions. Generative tools are the camera department — the edit is still where the film is made."
        meta="Sora / Runway / Kling / Midjourney / Higgsfield / ElevenLabs"
      />

      <section id="ai" data-section="AI work" className="pb-20 md:pb-28">
        <div className={CONTAINER}>
          <SectionHeader index="01" label="AI work" lines={["Future", { text: "Formats.", italic: true }]} />
          <ProjectGrid projects={aiProjects} />
        </div>
      </section>

      <section id="process" data-section="Process" className="bg-bg-soft py-20 [--section-bg:var(--bg-soft)] md:py-28">
        <div className={CONTAINER}>
          <SectionHeader index="02" label="Process" lines={["How it's", { text: "made.", italic: true }]} />
          <Reveal stagger className="grid grid-cols-1 border-t border-line sm:grid-cols-2 lg:grid-cols-4">
            {process.map((step, i) => (
              <div key={step.title} className="border-b border-line py-8 pr-6 lg:border-b-0 lg:border-r lg:pl-6 lg:first:pl-0 lg:last:border-r-0">
                <p className="font-mono text-[11px] text-muted">{pad(i + 1)}</p>
                <h3 className="type-label mt-6 text-3xl">{step.title}</h3>
                <p className="mt-4 max-w-xs text-base leading-relaxed text-muted">{step.text}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>
    </div>
  );
}
