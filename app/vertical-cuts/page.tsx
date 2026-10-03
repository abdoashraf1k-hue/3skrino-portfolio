import type { Metadata } from "next";
import PageHeader from "@/components/ui/PageHeader";
import ReelsView from "@/components/ui/ReelsView";
import SectionHeader from "@/components/ui/SectionHeader";
import WorkGrid from "@/components/ui/WorkGrid";
import { categories } from "@/data/categories";
import { reels, verticalProjects } from "@/data/projects";
import { pageMetadata } from "@/lib/seo";
import { CONTAINER } from "@/lib/utils";

export const metadata: Metadata = pageMetadata({
  title: "Vertical Cuts",
  description: "Every 9:16 edit — reels, TikToks, Shorts and vertical brand work by 3SKRINO.",
  path: "/vertical-cuts",
});

/** All 9:16 work: the vertical projects (filterable) and the reels (grid ⇄ full-screen player). */
export default function VerticalCutsPage() {
  return (
    <>
      <PageHeader
        label="(01) 9:16"
        title={
          <>
            Vertical <span className="italic text-accent">Cuts</span>
          </>
        }
        description="Short-form built for the thumb. Hooks in the first second, pacing that holds, and cuts designed for sound-on and sound-off."
        meta={`${verticalProjects.length} projects · ${reels.length} reels`}
      />

      <section id="projects" data-section="Projects" className="pb-20 md:pb-28">
        <div className={CONTAINER}>
          <SectionHeader index="01" label="Projects — 9:16" lines={["The", { text: "Work.", italic: true }]} />
          <WorkGrid projects={verticalProjects} categories={categories} hideOrientation />
        </div>
      </section>

      <section id="reels" data-section="Reels" className="bg-bg-soft py-20 [--section-bg:var(--bg-soft)] md:py-28">
        <div className={CONTAINER}>
          <SectionHeader
            index="02"
            label="Reels / Social"
            lines={["The", { text: "Reels.", italic: true }]}
            aside={<p className="max-w-xs text-base leading-relaxed text-muted">Tap any reel to play it full-screen — swipe or use the arrow keys.</p>}
          />
          <ReelsView reels={reels} />
        </div>
      </section>
    </>
  );
}
