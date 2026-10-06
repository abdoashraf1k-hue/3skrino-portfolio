import Link from "next/link";
import BentoGrid from "@/components/ui/BentoGrid";
import { projectBentoItems } from "@/components/ui/projectBento";
import SectionHeader from "@/components/ui/SectionHeader";
import { horizontalProjects, verticalProjects, type Project } from "@/data/projects";
import { T } from "@/lib/brand";
import { CONTAINER, cn } from "@/lib/utils";

const more = (href: string, textKey: string) => (
  <Link
    href={href}
    className="font-mono text-[11px] uppercase tracking-widest text-muted transition-colors duration-300 hover:text-accent"
  >
    <T k={textKey} /> →
  </Link>
);

type Props = {
  id: string;
  label: string;
  /** admin → Text: `${textKey}.label / .headline / .meta / .more`. */
  textKey: string;
  projects: Project[];
  href: string;
  soft?: boolean;
  gap?: number;
};

function Cuts({ id, label, textKey, projects, href, soft, gap }: Props) {
  if (!projects.length) return null;
  return (
    <section id={id} data-section={label} className={cn("py-16 md:py-24", soft && "bg-bg-soft [--section-bg:var(--bg-soft)]")}>
      <div className={CONTAINER}>
        <SectionHeader
          textKey={textKey}
          aside={
            <div className="flex flex-col items-start gap-3 lg:items-end">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                <T k={`${textKey}.meta`} vars={{ n: projects.length }} />
              </span>
              {more(href, `${textKey}.more`)}
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
      textKey="home.vertical"
      projects={verticalProjects}
      href="/vertical-cuts"
    />
  );
}

/** Home: the 16:9 showpieces. */
export function HorizontalCuts() {
  return (
    <Cuts
      id="horizontal-cuts"
      label="Horizontal Cuts"
      textKey="home.horizontal"
      projects={horizontalProjects}
      href="/horizontal-cuts"
      soft
      gap={6}
    />
  );
}
