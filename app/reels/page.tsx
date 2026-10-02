import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import PageHeader from "@/components/ui/PageHeader";
import ReelsView from "@/components/ui/ReelsView";
import { reels } from "@/data/projects";
import { CONTAINER, cn } from "@/lib/utils";

export const metadata: Metadata = pageMetadata({
  title: "Reels",
  description: "Vertical-first edits for Instagram, TikTok and YouTube Shorts.",
  path: "/reels",
});

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
        <ReelsView reels={reels} />
      </section>
    </>
  );
}
