import Link from "next/link";
import BentoGrid from "@/components/ui/BentoGrid";
import { projectBentoItems } from "@/components/ui/projectBento";
import SectionHeader, { type HeadlineLine } from "@/components/ui/SectionHeader";
import { horizontalProjects, verticalProjects, type Project } from "@/data/projects";
import { CONTAINER, cn } from "@/lib/utils";

const more = (href: string, label: string) => (
  <Link
    href={href}
    className="font-mono text-[11px] uppercase tracking-widest text-muted transition-colors duration-300 hover:text-accent"
  >
    {label} →
  </Link>
);

type Props = {
  id: string;
  label: string;
  lines: HeadlineLine[];
  projects: Project[];
  href: string;
  meta: string;
  soft?: boolean;
  gap?: number;
};

function Cuts({ id, label, lines, projects, href, meta, soft, gap }: Props) {
  if (!projects.length) return null;
  return (
    <section id={id} data-section={label} className={cn("py-16 md:py-24", soft && "bg-bg-soft [--section-bg:var(--bg-soft)]")}>
      <div className={CONTAINER}>
        <SectionHeader
          label={label}
          lines={lines}
          aside={
            <div className="flex flex-col items-start gap-3 lg:items-end">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{meta}</span>
              {more(href, `All ${label.toLowerCase()}`)}
            </div>
          }
        />
        <BentoGrid items={projectBentoItems(projects)} gap={gap} />
      </div>
    </section>
  );
}

/** Home: every 9:16 piece — the default, and the majority. */
export function VerticalCuts() {
  return (
    <Cuts
      id="vertical-cuts"
      label="Vertical Cuts"
      lines={["Vertical", { text: "Cuts.", italic: true }]}
      projects={verticalProjects}
      href="/vertical-cuts"
      meta={`${verticalProjects.length} projects — 9:16 · Reels / TikTok / Shorts`}
    />
  );
}

/** Home: the 16:9 showpieces. */
export function HorizontalCuts() {
  return (
    <Cuts
      id="horizontal-cuts"
      label="Horizontal Cuts"
      lines={["Horizontal", { text: "Cuts.", italic: true }]}
      projects={horizontalProjects}
      href="/horizontal-cuts"
      meta={`${horizontalProjects.length} projects — 16:9 · Brand films / Launch spots`}
      soft
      gap={6}
    />
  );
}
