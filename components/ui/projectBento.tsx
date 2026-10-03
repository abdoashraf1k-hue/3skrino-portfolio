import type { BentoAspect, BentoItem } from "@/components/ui/BentoGrid";
import ProjectCard from "@/components/ui/ProjectCard";
import type { Project } from "@/data/projects";

/**
 * Projects → bento tiles. Horizontal work is wide, vertical alternates tall /
 * small (so columns don't all run the same height), and featured work takes a
 * 2×2 hero tile. `indexOf` keeps the card's number stable when the list shown
 * is a filtered subset of a larger one.
 */
export function projectBentoItems(projects: Project[], indexOf: (p: Project) => number = (p) => projects.indexOf(p)): BentoItem[] {
  let verticals = 0;
  return projects.map((project) => {
    const featured = Boolean(project.featured);
    // The hint stays orientation-based (it also sets the mobile tile ratio);
    // priority is what promotes featured work to 2×2 on tablet + desktop.
    const aspect: BentoAspect =
      project.orientation === "horizontal" ? "wide" : verticals++ % 2 === 0 ? "tall" : "small";
    return {
      id: project.id,
      aspect,
      priority: featured ? 1 : 0,
      node: <ProjectCard project={project} index={indexOf(project)} aspect={featured ? "square" : aspect} />,
    };
  });
}
