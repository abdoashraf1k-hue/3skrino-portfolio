"use client";

import Image from "next/image";
import { useRef } from "react";
import { trackVideoPlay } from "@/lib/analytics";
import { useInView } from "@/lib/hooks";
import { skipImageOptimizer } from "@/lib/utils";

type VideoPlayerProps = {
  projectId: string;
  src: string;
  poster?: string;
  title: string;
  sizes?: string;
};

/**
 * The <video> only mounts once the frame is near the viewport; until then the
 * poster (via next/image) holds the space. Reports the first play.
 */
export default function VideoPlayer({ projectId, src, poster, title, sizes = "(min-width: 1024px) 70vw, 100vw" }: VideoPlayerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { rootMargin: "300px" });
  const played = useRef(false);

  return (
    <div ref={ref} className="absolute inset-0">
      {poster && !inView && (
        <Image src={poster} alt={title} fill sizes={sizes} unoptimized={skipImageOptimizer(poster)} className="object-cover" />
      )}
      {inView && (
        <video
          src={src}
          poster={poster || undefined}
          controls
          playsInline
          preload="metadata"
          aria-label={title}
          onPlay={() => {
            if (played.current) return;
            played.current = true;
            trackVideoPlay(projectId);
          }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}
