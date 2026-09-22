import type { Metadata } from "next";
import PageHeader from "@/components/ui/PageHeader";
import WorkGrid from "@/components/ui/WorkGrid";
import { categories } from "@/data/categories";
import { projects } from "@/data/projects";
import { CONTAINER, cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Work",
  description: "Brand films, commercials, social and AI work by 3SKRINO.",
};

export default function WorkPage() {
  return (
    <>
      <PageHeader
        label="(Index) Work"
        title="All work"
        description="A selection of films, campaigns and experiments across nine fields — edited, graded and finished in-house."
        meta={`${projects.length} projects — 2024 → 2026`}
      />
      <section id="work" className={cn(CONTAINER, "pb-24 md:pb-40")}>
        <WorkGrid projects={projects} categories={categories} />
      </section>
    </>
  );
}
