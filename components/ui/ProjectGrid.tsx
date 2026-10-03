import BentoGrid from "@/components/ui/BentoGrid";
import { projectBentoItems } from "@/components/ui/projectBento";
import type { Project } from "@/data/projects";

/** Bento mosaic of projects: wide tiles for 16:9, tall/small for 9:16, featured 2×2. */
export default function ProjectGrid({ projects }: { projects: Project[] }) {
  return <BentoGrid items={projectBentoItems(projects)} />;
}
