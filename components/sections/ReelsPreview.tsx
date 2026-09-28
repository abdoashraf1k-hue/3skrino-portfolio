import Link from "next/link";
import ReelCard from "@/components/ui/ReelCard";
import Reveal from "@/components/ui/Reveal";
import SectionHeader from "@/components/ui/SectionHeader";
import { reels } from "@/data/projects";
import { CONTAINER } from "@/lib/utils";

export default function ReelsPreview() {
  return (
    <section id="reels" className="border-b border-line py-24 md:py-40">
      <div className={CONTAINER}>
        <SectionHeader
          index="04"
          label="Reels"
          lines={["Vertical", "Stories."]}
          aside={
            <div className="flex flex-col items-start gap-3 lg:items-end">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                Swipe / scroll →
              </span>
              <Link
                href="/reels"
                className="font-mono text-[11px] uppercase tracking-widest text-muted transition-colors duration-300 hover:text-accent"
              >
                All reels →
              </Link>
            </div>
          }
        />
      </div>

      <Reveal>
        {/* Row bleeds to the viewport edge; inner padding matches the container. */}
        <ul className="flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-6 pb-2 md:gap-6 md:px-12 lg:px-20 min-[1600px]:px-[calc((100vw-1600px)/2+5rem)]">
          {reels.map((reel, i) => (
            <li key={reel.id} className="w-[240px] shrink-0 snap-start md:w-[280px]">
              <ReelCard reel={reel} index={i} />
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
