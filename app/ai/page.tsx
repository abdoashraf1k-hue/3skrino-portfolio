import type { Metadata } from "next";
import PageHeader from "@/components/ui/PageHeader";
import ProjectGrid from "@/components/ui/ProjectGrid";
import Reveal from "@/components/ui/Reveal";
import { projects } from "@/data/projects";
import { CONTAINER, cn, pad } from "@/lib/utils";

export const metadata: Metadata = {
  title: "AI Work",
  description: "AI-generated films and sequences directed and edited by 3SKRINO.",
};

const process = [
  { title: "Concept", text: "Treatment, references and a shot list — the same prep as a live shoot." },
  { title: "Look dev", text: "Style frames in Midjourney to lock palette, lensing and texture." },
  { title: "Generation", text: "Hundreds of takes across Sora, Runway and Kling, curated like dailies." },
  { title: "Final cut", text: "Edit, grade, sound and AI voice — finished to broadcast standard." },
];

export default function AIPage() {
  const aiWork = projects.filter((p) => p.category === "ai");

  return (
    <>
      <PageHeader
        label="(04) Generative"
        title={
          <>
            <span className="text-accent">AI</span> Work
          </>
        }
        description="Generated sequences directed like real productions. Generative tools are the camera department — the edit is still where the film is made."
        meta="Sora / Runway / Kling / Midjourney / ElevenLabs"
      />

      <section id="ai" className={cn(CONTAINER, "pb-24 md:pb-32")}>
        <ProjectGrid projects={aiWork} />
      </section>

      <section id="process" className="border-t border-line py-24 md:py-32">
        <div className={CONTAINER}>
          <p className="mb-12 font-mono text-[11px] uppercase tracking-widest text-muted">(Process)</p>
          <Reveal stagger className="grid grid-cols-1 border-t border-line sm:grid-cols-2 lg:grid-cols-4">
            {process.map((step, i) => (
              <div key={step.title} className="border-b border-line py-8 pr-6 lg:border-b-0 lg:border-r lg:pl-6 lg:first:pl-0 lg:last:border-r-0">
                <p className="font-mono text-[11px] text-muted">{pad(i + 1)}</p>
                <h3 className="mt-6 text-3xl font-black uppercase tracking-tight">{step.title}</h3>
                <p className="mt-4 max-w-xs text-base leading-relaxed text-muted">{step.text}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>
    </>
  );
}
