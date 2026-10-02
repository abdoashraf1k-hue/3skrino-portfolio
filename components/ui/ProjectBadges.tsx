import { projectCredits, type Project } from "@/data/projects";
import { cn } from "@/lib/utils";

type ProjectBadgesProps = Pick<Project, "filmed" | "directed" | "edited"> & {
  size?: "sm" | "md";
  /** "Shot by me" style labels (project detail page). */
  long?: boolean;
  className?: string;
};

const LABELS = {
  filmed: { icon: "🎬", short: "Shot", long: "Shot by me" },
  directed: { icon: "🎥", short: "Directed", long: "Directed by me" },
  edited: { icon: "✂️", short: "Edited", long: "Edited by me" },
} as const;

/**
 * Credit pills. All three collapse into one "SHOT · DIRECTED · EDITED" pill;
 * otherwise one pill per credit. Static — nothing to animate.
 */
export default function ProjectBadges({ filmed, directed, edited, size = "sm", long = false, className }: ProjectBadgesProps) {
  const credits = projectCredits({ filmed, directed, edited });
  const keys = (["filmed", "directed", "edited"] as const).filter((k) => credits[k]);
  if (!keys.length) return null;

  const pill = cn(
    "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-accent/40 bg-accent/5 font-mono uppercase tracking-wider text-accent",
    size === "sm" ? "px-2 py-0.5 text-[9px]" : "px-3 py-1 text-[10px]",
  );
  const label = (k: (typeof keys)[number]) => (long ? LABELS[k].long : LABELS[k].short);

  const all = keys.length === 3;
  return (
    <ul aria-label="Credits" className={cn("flex flex-wrap gap-1", className)}>
      {all ? (
        <li className={pill}>
          <span aria-hidden>{LABELS.filmed.icon}</span>
          {keys.map(label).join(" · ")}
        </li>
      ) : (
        keys.map((k) => (
          <li key={k} className={pill}>
            <span aria-hidden>{LABELS[k].icon}</span>
            {label(k)}
          </li>
        ))
      )}
    </ul>
  );
}
