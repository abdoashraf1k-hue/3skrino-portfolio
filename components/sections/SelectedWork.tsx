import Link from "next/link";
import HorizontalStack from "@/components/sections/HorizontalStack";
import VerticalMasonry from "@/components/sections/VerticalMasonry";
import SectionHeader from "@/components/ui/SectionHeader";
import { horizontalProjects, verticalProjects } from "@/data/projects";
import { CONTAINER, cn } from "@/lib/utils";

const allWork = (
  <Link
    href="/work"
    className="font-mono text-[11px] uppercase tracking-widest text-muted transition-colors duration-300 hover:text-accent"
  >
    All work →
  </Link>
);

export default function SelectedWork() {
  return (
    <>
      {/* A — vertical work: the default, and the majority */}
      <section id="work" className="border-b border-line py-20 md:py-32">
        <div className={CONTAINER}>
          <SectionHeader
            index="01"
            label="Vertical work — 9:16"
            lines={["Vertical", { text: "Work.", italic: true }]}
            aside={
              <div className="flex flex-col items-start gap-3 lg:items-end">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                  {verticalProjects.length} projects — Reels / TikTok / Shorts
                </span>
                {allWork}
              </div>
            }
          />
          <VerticalMasonry projects={verticalProjects} />
        </div>
      </section>

      {/* B — horizontal work: the featured minority */}
      {horizontalProjects.length > 0 && (
        <section id="featured" className="border-b border-line bg-bg-soft py-20 md:py-32">
          <div className={cn(CONTAINER)}>
            <SectionHeader
              index="02"
              label="Horizontal / Featured — 16:9"
              lines={["Wide", { text: "Screen.", italic: true }]}
              aside={
                <p className="max-w-xs text-base leading-relaxed text-muted">
                  The minority, and the showpieces — brand films, launch spots and
                  music visuals cut for the big screen.
                </p>
              }
            />
            <HorizontalStack projects={horizontalProjects} />
          </div>
        </section>
      )}
    </>
  );
}
