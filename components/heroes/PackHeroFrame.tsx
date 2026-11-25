"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { packHeroUrl, packThumbUrl, type PackHero } from "@/data/hero-pack";
import { getLenis, scrollToTarget } from "@/lib/scroll";

/** The hero pages' #links → the site's real routes ("#top" scrolls instead). */
const ROUTES: Record<string, string> = {
  "#showreel": "/vertical-cuts?view=player",
  "#contact": "/contact",
  "#work": "/vertical-cuts",
  "#vertical": "/vertical-cuts",
  "#horizontal": "/horizontal-cuts",
  "#ai": "/ai-cuts",
  "#about": "/about",
};

const NAV = "3skrino-hero-nav";
const WHEEL = "3skrino-hero-wheel";

function isMessage(d: unknown): d is { type: string; href?: unknown; deltaY?: unknown } {
  return typeof d === "object" && d !== null && "type" in d && typeof d.type === "string";
}

/**
 * A pack hero (public/heroes/) full-width at the top of the home page, in a
 * same-origin iframe under the site's own navigation. Its thumbnail is the
 * first paint and stays until the frame has loaded. The hero's links and
 * wheel events arrive as postMessages and are mapped to the site's routes and
 * scroll.
 */
export default function PackHeroFrame({ hero }: { hero: PackHero }) {
  const thumb = packThumbUrl(hero);
  const router = useRouter();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [covered, setCovered] = useState(false);

  // The frame can finish loading before React hydrates and attaches onLoad.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const doc = frameRef.current?.contentDocument;
        if (doc && doc.readyState === "complete" && doc.location.pathname.endsWith(hero.file)) setLoaded(true);
      } catch {
        // not readable yet — onLoad will fire
      }
    });
    return () => cancelAnimationFrame(id);
  }, [hero.file]);

  useEffect(() => {
    const onMessage = (e: MessageEvent<unknown>) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      const d = e.data;
      if (!isMessage(d)) return;
      if (d.type === NAV && typeof d.href === "string") {
        if (d.href === "#top") scrollToTarget(0);
        else if (ROUTES[d.href]) router.push(ROUTES[d.href]);
      } else if (d.type === WHEEL && typeof d.deltaY === "number" && Number.isFinite(d.deltaY)) {
        // Through Lenis when it's running (a native scrollBy would fight its smoothing).
        const lenis = getLenis();
        if (lenis) lenis.scrollTo(lenis.targetScroll + d.deltaY);
        else window.scrollBy(0, d.deltaY);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router]);

  return (
    <section id="home" aria-label={hero.title} className="relative h-[100svh] w-full overflow-hidden bg-black">
      {/* React hoists this into <head> of the server HTML, so the thumbnail is the first paint. */}
      <link rel="preload" as="image" href={thumb} fetchPriority="high" />
      {/* Removed once the frame has faded in: the hero pages are partly transparent, so it would show through. */}
      {!covered && (
        // eslint-disable-next-line @next/next/no-img-element -- static placeholder, same file the preload fetched
        <img src={thumb} alt="" aria-hidden fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <iframe
        ref={frameRef}
        src={packHeroUrl(hero, "?nav=0&fit=cover")}
        title={hero.title}
        allow="autoplay"
        loading="eager"
        onLoad={() => setLoaded(true)}
        onTransitionEnd={() => setCovered(loaded)}
        className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </section>
  );
}
