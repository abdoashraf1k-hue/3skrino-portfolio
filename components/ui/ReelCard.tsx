import Link from "next/link";
import type { ReactNode } from "react";
import Placeholder from "@/components/ui/Placeholder";
import ProjectBadges from "@/components/ui/ProjectBadges";
import type { Reel } from "@/data/projects";
import { cn } from "@/lib/utils";

type ReelCardProps = {
  reel: Reel;
  index: number;
  href?: string;
  /** When set, the card is a button that opens the reels player instead of a link. */
  onOpen?: () => void;
  /** Use the reel's own aspect (masonry) instead of a fixed 9:16. */
  natural?: boolean;
  className?: string;
};

export default function ReelCard({ reel, index, href = "/vertical-cuts", onOpen, natural = false, className }: ReelCardProps) {
  const body: ReactNode = (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg bg-bg-soft transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]",
        natural ? reel.aspect : "aspect-[9/16]",
      )}
    >
      <Placeholder title={reel.title} seed={index + 2} size="sm" image={reel.poster || undefined} sizes="(min-width: 1024px) 25vw, 50vw" />
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 font-mono text-[10px] uppercase tracking-widest text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-accent-2" />
          Reel {String(index + 1).padStart(2, "0")}
        </span>
        <span>9:16</span>
      </div>
      {onOpen && (
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <span className="flex size-14 items-center justify-center rounded-full border border-fg/40 bg-bg/40 text-xs backdrop-blur">▶</span>
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-bg/80 to-transparent p-4 pt-16 text-left">
        <ProjectBadges filmed={reel.filmed} directed={reel.directed} edited={reel.edited} className="mb-2" />
        <h3 className="type-label text-lg">{reel.title}</h3>
        <p className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-widest text-muted">
          <span>{reel.client}</span>
          <span>▶ {reel.views} views</span>
        </p>
      </div>
    </div>
  );

  if (onOpen) {
    return (
      <button type="button" onClick={onOpen} aria-label={`Play ${reel.title}`} className={cn("group block w-full", className)}>
        {body}
      </button>
    );
  }
  return (
    <Link href={href} className={cn("group block", className)}>
      {body}
    </Link>
  );
}
