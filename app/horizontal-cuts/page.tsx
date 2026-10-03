import type { Metadata } from "next";
import PageHeader from "@/components/ui/PageHeader";
import SectionHeader from "@/components/ui/SectionHeader";
import WorkGrid from "@/components/ui/WorkGrid";
import { categories } from "@/data/categories";
import { horizontalProjects } from "@/data/projects";
import { pageMetadata } from "@/lib/seo";
import { CONTAINER } from "@/lib/utils";

export const metadata: Metadata = pageMetadata({
  title: "Horizontal Cuts",
  description: "Every 16:9 film — brand films, launch spots and music visuals cut for the big screen by 3SKRINO.",
  path: "/horizontal-cuts",
});

/** All 16:9 work, filterable. */
export default function HorizontalCutsPage() {
  return (
    <>
      <PageHeader
        label="(02) 16:9"
        title={
          <>
            Horizontal <span className="italic text-accent">Cuts</span>
          </>
        }
        description="The showpieces — brand films, launch spots and music visuals, cut for the big screen and finished for broadcast."
        meta={`${horizontalProjects.length} ${horizontalProjects.length === 1 ? "film" : "films"}`}
      />

      <section id="films" data-section="Films" className="pb-24 md:pb-32">
        <div className={CONTAINER}>
          <SectionHeader index="01" label="Films — 16:9" lines={["Wide", { text: "Screen.", italic: true }]} />
          <WorkGrid projects={horizontalProjects} categories={categories} hideOrientation />
        </div>
      </section>
    </>
  );
}
