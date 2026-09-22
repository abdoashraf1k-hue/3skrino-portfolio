import Link from "next/link";
import Placeholder from "@/components/ui/Placeholder";
import type { Reel } from "@/data/projects";
import { cn } from "@/lib/utils";

type ReelCardProps = {
  reel: Reel;
  index: number;
  href?: string;
  /** Use the reel's own aspect (masonry) instead of a fixed 9:16. */
  natural?: boolean;
  className?: string;
};

export default function ReelCard({ reel, index, href = "/reels", natural = false, className }: ReelCardProps) {
  return (
    <Link href={href} data-hover className={cn("group block", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-lg bg-bg-soft transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]",
          natural ? reel.aspect : "aspect-[9/16]",
        )}
      >
        <Placeholder title={reel.title} seed={index + 2} size="sm" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 font-mono text-[10px] uppercase tracking-widest text-muted">
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-accent-2" />
            Reel {String(index + 1).padStart(2, "0")}
          </span>
          <span>9:16</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-bg/80 to-transparent p-4 pt-16">
          <h3 className="text-lg font-black uppercase tracking-tight">{reel.title}</h3>
          <p className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-widest text-muted">
            <span>{reel.client}</span>
            <span>▶ {reel.views} views</span>
          </p>
        </div>
      </div>
    </Link>
  );
}
