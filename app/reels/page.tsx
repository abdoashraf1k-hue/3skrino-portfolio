import type { Metadata } from "next";
import PageHeader from "@/components/ui/PageHeader";
import ReelCard from "@/components/ui/ReelCard";
import Reveal from "@/components/ui/Reveal";
import { reels } from "@/data/projects";
import { CONTAINER, cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Reels",
  description: "Vertical-first edits for Instagram, TikTok and YouTube Shorts.",
};

export default function ReelsPage() {
  return (
    <>
      <PageHeader
        label="(03) Vertical"
        title="Reels"
        description="Short-form built for the thumb. Hooks in the first second, pacing that holds, and cuts designed for sound-on and sound-off."
        meta={`${reels.length} reels — 11M+ views`}
      />
      <section id="reels" className={cn(CONTAINER, "pb-24 md:pb-40")}>
        {/* CSS-columns masonry; reels carry mixed aspect ratios */}
        <div className="columns-2 gap-4 md:columns-3 md:gap-6 lg:columns-4">
          {reels.map((reel, i) => (
            <Reveal key={reel.id} className="mb-4 break-inside-avoid md:mb-6">
              <ReelCard reel={reel} index={i} href="/reels" natural />
            </Reveal>
          ))}
        </div>
      </section>
    </>
  );
}
