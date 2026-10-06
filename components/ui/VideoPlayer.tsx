"use client";

import Image from "next/image";
import { useRef, useState, type SyntheticEvent } from "react";
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

/** Reloads after a playback error before giving up. */
const MAX_RETRIES = 2;
/**
 * A reload older than this was a success that later expired (a long-open tab),
 * so the next error gets a fresh budget. Shorter gaps count against it, so a
 * genuinely broken file can't reload forever.
 */
const RETRY_BUDGET_RESET_MS = 10 * 60_000;

/** A reload in progress: which src it belongs to, the cache-buster, where to resume. */
type Retry = { for: string; count: number; stamp: number; resumeAt: number; resume: boolean };

/** Appends `r=<stamp>` so the browser re-requests (and re-follows any redirect). */
function withBuster(src: string, stamp: number): string {
  const hash = src.indexOf("#");
  const base = hash === -1 ? src : src.slice(0, hash);
  const frag = hash === -1 ? "" : src.slice(hash);
  return `${base}${base.includes("?") ? "&" : "?"}r=${stamp}${frag}`;
}

/**
 * The <video> only mounts once the frame is near the viewport; until then the
 * poster (via next/image) holds the space. Reports the first play.
 *
 * `/media/…` sources 302 to a short-lived presigned URL. A long session can
 * outlive it (a seek after expiry fails), so on error the player re-requests
 * the src with a cache-busting param — which mints a fresh presigned URL —
 * and resumes at the same time. At most MAX_RETRIES per src.
 */
export default function VideoPlayer({ projectId, src, poster, title, sizes = "(min-width: 1024px) 70vw, 100vw" }: VideoPlayerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { rootMargin: "300px" });
  const played = useRef(false);
  const [retry, setRetry] = useState<Retry | null>(null);

  // A retry only applies to the src it was made for — a new src starts clean.
  const current = retry && retry.for === src ? retry : null;
  const videoSrc = current ? withBuster(src, current.stamp) : src;

  const onError = (e: SyntheticEvent<HTMLVideoElement>) => {
    const count = current && Date.now() - current.stamp < RETRY_BUDGET_RESET_MS ? current.count : 0;
    if (count >= MAX_RETRIES) return;
    const v = e.currentTarget;
    setRetry({
      for: src,
      count: count + 1,
      stamp: Date.now(),
      resumeAt: Number.isFinite(v.currentTime) ? v.currentTime : 0,
      resume: played.current && !v.ended,
    });
  };

  const onLoadedMetadata = (e: SyntheticEvent<HTMLVideoElement>) => {
    if (!current) return;
    const v = e.currentTarget;
    if (current.resumeAt > 0 && Math.abs(v.currentTime - current.resumeAt) > 0.25) v.currentTime = current.resumeAt;
    if (current.resume) void v.play().catch(() => undefined);
  };

  return (
    <div ref={ref} className="absolute inset-0">
      {poster && !inView && (
        <Image src={poster} alt={title} fill sizes={sizes} unoptimized={skipImageOptimizer(poster)} className="object-cover" />
      )}
      {inView && (
        <video
          src={videoSrc}
          poster={poster || undefined}
          controls
          playsInline
          preload="metadata"
          aria-label={title}
          onError={onError}
          onLoadedMetadata={onLoadedMetadata}
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
