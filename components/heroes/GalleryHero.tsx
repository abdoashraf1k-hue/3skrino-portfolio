"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import SafeBoundary from "@/components/three/SafeBoundary";
import { getCategory } from "@/data/categories";
import { projectHref, projects, type Project } from "@/data/projects";
import { site } from "@/data/site";
import { RICH_MOTION_QUERY, useMediaQuery } from "@/lib/hooks";
import { useHeroConfig, useSiteConfig } from "@/lib/live-config";
import { cn, skipImageOptimizer } from "@/lib/utils";
import { HeroCtas, useTrackProgress } from "./shared";

const GalleryScene = dynamic(() => import("@/components/three/GalleryScene"), { ssr: false });

/** `count` wall tiles cycling through the projects (featured first). */
function wallProjects(count: number): Project[] {
  const ordered = [...projects.filter((p) => p.featured), ...projects.filter((p) => !p.featured)];
  if (!ordered.length) return [];
  return Array.from({ length: count }, (_, i) => ordered[i % ordered.length]);
}

/**
 * Hero 3 — 3D Gallery Wall. A cinema museum at night: three curved walls of
 * films under coloured spotlights, the silhouette standing in front. The
 * pointer orbits the camera, scrolling walks in, clicking a film flies to it
 * and opens its details; clicking empty space (or Esc) steps back.
 * Phones / reduced motion / no WebGL: a still perspective wall of cards.
 */
export default function GalleryHero() {
  const config = useHeroConfig();
  const { content, cinematic } = useSiteConfig();
  const count = cinematic?.heroOptions.galleryCount ?? 30;
  const tiles = useMemo(() => wallProjects(count), [count]);
  const rich = useMediaQuery(RICH_MOTION_QUERY);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const progress = useTrackProgress(sectionRef, rich);
  const live = rich && !failed;
  const project = selected !== null ? tiles[selected] : null;
  const logos = config.logos.enabled ? config.logos.items.filter((l) => l.visible) : [];

  useEffect(() => {
    if (selected === null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  return (
    <section id="home" ref={sectionRef} className={cn("relative bg-[#050505]", live ? "h-[200svh]" : "min-h-svh")}>
      <div className={cn("relative overflow-hidden", live ? "sticky top-0 h-svh" : "min-h-svh")}>
        {!(live && ready) && <StillWall tiles={tiles.slice(0, 12)} dim={live} />}
        {live && (
          <div className={cn("absolute inset-0 transition-opacity duration-1000", ready ? "opacity-100" : "opacity-0")}>
            <SafeBoundary onError={() => setFailed(true)}>
              <GalleryScene
                tiles={tiles}
                poses={config.poses}
                progress={progress}
                selected={selected}
                onSelect={setSelected}
                onReady={() => setReady(true)}
              />
            </SafeBoundary>
          </div>
        )}

        {/* Wall text */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 z-10 px-6 pt-24 transition-opacity duration-500 md:px-12",
            project && "opacity-0",
          )}
        >
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Gallery — {tiles.length} films · open late</p>
          <h1 className="type-display mt-3 text-[clamp(3.2rem,9vw,9rem)] leading-[0.85]">{site.name}</h1>
          <p className="mt-4 max-w-md text-base leading-snug text-fg/70 md:text-lg">{content.tagline}</p>
          <div className="pointer-events-auto inline-block">
            <HeroCtas className="mt-8" />
          </div>
          {logos.length > 0 && (
            <ul aria-label="Clients" className="mt-10 flex max-w-lg flex-wrap items-center gap-x-6 gap-y-3 opacity-50">
              {logos.map((l) => (
                <li key={l.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- logos are arbitrary SVG / blob URLs */}
                  <img src={l.imageUrl} alt={l.name} className="h-5 w-auto" style={{ maxWidth: (l.size ?? 60) * 1.6 }} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {live && !project && (
          <p className="pointer-events-none absolute inset-x-0 bottom-8 z-10 text-center font-mono text-[10px] uppercase tracking-widest text-white/45">
            Move to look around · click a film · scroll to walk in
          </p>
        )}

        {/* The film you flew to */}
        {project && (
          <aside
            aria-live="polite"
            className="absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col justify-end gap-4 bg-gradient-to-l from-black via-black/85 to-transparent p-8 pb-16 md:p-12"
          >
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
              {getCategory(project.category)?.name ?? project.category} · {project.year}
            </p>
            <h2 className="type-display text-5xl leading-[0.9] md:text-6xl">{project.title}</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-wider">
              {[
                ["Client", project.client],
                ["Role", project.role],
                ["Runtime", project.duration],
                ["Tools", project.tools.join(", ")],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-white/40">{k}</dt>
                  <dd className="text-white/85">{v || "—"}</dd>
                </div>
              ))}
            </dl>
            {project.description && <p className="text-sm leading-relaxed text-fg/70">{project.description}</p>}
            <div className="mt-2 flex flex-wrap gap-4">
              <Link
                href={projectHref(project)}
                className="border border-fg px-6 py-3 font-mono text-[11px] uppercase tracking-widest transition-colors hover:bg-fg hover:text-bg"
              >
                Open film
              </Link>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="font-mono text-[11px] uppercase tracking-widest text-muted transition-colors hover:text-fg"
              >
                Back to the wall (Esc)
              </button>
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}

/** The no-WebGL wall: a still, gently curved row of cards. */
function StillWall({ tiles, dim }: { tiles: Project[]; dim: boolean }) {
  return (
    <div aria-hidden={dim || undefined} className="absolute inset-0 flex items-center justify-center overflow-hidden [perspective:1100px]">
      <div className="grid w-[120%] max-w-[1500px] grid-cols-3 gap-3 px-4 pt-[30vh] opacity-70 sm:grid-cols-4 md:grid-cols-6 md:pt-[18vh]">
        {tiles.map((p, i) => {
          const col = i % 6;
          return (
            <Link
              key={`${p.id}-${i}`}
              href={projectHref(p)}
              tabIndex={dim ? -1 : undefined}
              className="relative aspect-[9/16] overflow-hidden border border-white/10 bg-[#111]"
              style={{ transform: `rotateY(${(col - 2.5) * -7}deg) translateZ(${-Math.abs(col - 2.5) * 30}px)` }}
            >
              {p.thumbnail ? (
                <Image src={p.thumbnail} alt={p.title} fill sizes="16vw" unoptimized={skipImageOptimizer(p.thumbnail)} className="object-cover" />
              ) : (
                <span className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${p.accentColor}55, #0b0b0b 70%)` }} />
              )}
              {/* Spotlight from above */}
              <span className="absolute inset-0" style={{ background: "radial-gradient(70% 45% at 50% 0%, rgb(255 255 255 / 0.18), transparent 70%), linear-gradient(to top, rgb(0 0 0 / 0.75), transparent 55%)" }} />
              <span className="type-label absolute inset-x-2 bottom-2 text-[11px] text-white/85">{p.title}</span>
            </Link>
          );
        })}
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_45%,transparent,rgb(5_5_5/0.9))]" />
    </div>
  );
}
