"use client";

import { useEffect, useState, type CSSProperties } from "react";
import MiniPreview from "@/components/admin/MiniPreview";
import { card, Field, input, micro, Section, Slider, TabHeader, Toggle } from "@/components/admin/ui";
import { DEFAULT_CINEMATIC } from "@/data/cinematic-defaults";
import type { Project } from "@/data/projects";
import type { HeroVariant } from "@/data/site-config";
import { useConfigStore } from "../store";

const HEROES: { id: HeroVariant; name: string; idea: string; fallback: string; tech: string }[] = [
  {
    id: "cinematic",
    name: "Cinematic",
    idea: "The silhouette on the neon grid — 9 poses that follow the pointer, prism, bloom, embers.",
    fallback: "Static silhouette + CSS grid on phones / reduced motion.",
    tech: "WebGL · R3F",
  },
  {
    id: "split",
    name: "Split screen editorial",
    idea: "A magazine spread: the name types itself in on the left, a reel loops on the right. Drag the seam; scroll hands the frame to the reel; click for full-screen.",
    fallback: "Phones: the reel stacks over the text.",
    tech: "DOM · video",
  },
  {
    id: "gallery",
    name: "3D gallery wall",
    idea: "A night-time cinema museum: three curved walls of films under coloured spotlights. Orbit with the pointer, click a film to fly to it, scroll to walk in.",
    fallback: "A still perspective wall of cards.",
    tech: "WebGL · R3F",
  },
  {
    id: "timeline",
    name: "Timeline scrubber",
    idea: "Inside the edit: the pointer is the playhead scrubbing through the 9 poses; height zooms the timeline. J K L, ← →, Space.",
    fallback: "Same on every device — touch drags the timeline.",
    tech: "DOM",
  },
  {
    id: "mirror",
    name: "Mirror / reflection",
    idea: "A semicircle of mirrors, each echoing another pose back into itself. Hover a mirror to swap poses, click to freeze, scroll to fade them out.",
    fallback: "A still arc of mirror panes (hover still swaps).",
    tech: "WebGL · R3F",
  },
];

const PREVIEWS_KEY = "3skrino-admin-hero-previews";

type Props = { projects: Project[] };

export default function HeroesTab({ projects }: Props) {
  const { hero, site, setSite } = useConfigStore();
  const [live, setLive] = useState(true);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        setLive(localStorage.getItem(PREVIEWS_KEY) !== "off");
      } catch {
        // storage blocked — previews stay on
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);
  if (!site) return null;
  const options = site.cinematic.heroOptions;
  const setOptions = (patch: Partial<typeof options>) =>
    setSite((c) => ({ ...c, cinematic: { ...c.cinematic, heroOptions: { ...c.cinematic.heroOptions, ...patch } } }));
  const reels = projects.filter((p) => p.videoUrl);

  const togglePreviews = (on: boolean) => {
    setLive(on);
    try {
      localStorage.setItem(PREVIEWS_KEY, on ? "on" : "off");
    } catch {
      // ignore
    }
  };

  return (
    <div>
      <TabHeader
        title="Heroes"
        hint="five openings for the home page · click one to make it the hero · the dock and these frames show unsaved drafts"
      />

      <Section
        title="Active hero"
        help="Every hero uses the same poses, brands, roles and tagline. Picking one only changes the opening — nothing else on the site moves. Save to publish."
        aside={<Toggle label="Live previews" checked={live} onChange={togglePreviews} help="Each frame is the real home page. Turn off to keep the admin light on slower machines." />}
        onReset={() => setSite((c) => ({ ...c, heroVariant: "cinematic" }))}
      >
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {HEROES.map((h, i) => {
            const on = site.heroVariant === h.id;
            return (
              <div
                key={h.id}
                className={`admin-stagger ${card} flex flex-col overflow-hidden transition-colors ${on ? "border-[#e7fe55]" : "hover:border-white/30"}`}
                style={{ "--i": i } as CSSProperties}
              >
                <button type="button" onClick={() => setSite((c) => ({ ...c, heroVariant: h.id }))} aria-pressed={on} className="block text-left">
                  <MiniPreview path={`/?heroVariant=${h.id}`} hero={hero} site={site} enabled={live} title={`${h.name} preview`} />
                  <span className="flex items-start justify-between gap-3 p-3">
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className={`font-mono text-[10px] ${on ? "text-[#e7fe55]" : "text-white/35"}`}>0{i + 1}</span>
                        <span className="text-sm font-black uppercase tracking-tight">{h.name}</span>
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-white/55">{h.idea}</span>
                      <span className={`${micro} mt-2 block text-[9px] text-white/30`}>
                        {h.tech} · fallback: {h.fallback}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 px-2 py-1 font-mono text-[9px] uppercase tracking-widest ${on ? "bg-[#e7fe55] text-black" : "border border-white/15 text-white/45"}`}
                    >
                      {on ? "Active" : "Use"}
                    </span>
                  </span>
                </button>
                <a href={`/?heroVariant=${h.id}`} target="_blank" rel="noreferrer" className={`${micro} border-t border-white/10 px-3 py-2 text-white/40 hover:text-white`}>
                  Open full-size ↗
                </a>
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        title="Hero options"
        hint="settings for the alternate heroes"
        onReset={() => setSite((c) => ({ ...c, cinematic: { ...c.cinematic, heroOptions: DEFAULT_CINEMATIC.heroOptions } }))}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className={`${card} px-3 py-2.5`}>
            <Field label="Split — reel" hint={`${reels.length} projects with footage`}>
              <select value={options.splitReel} onChange={(e) => setOptions({ splitReel: e.target.value })} className={`${input} mt-1`}>
                <option value="">Auto — first featured vertical</option>
                {reels.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} · {p.orientation}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Slider
            label="Gallery — films on the wall"
            value={options.galleryCount}
            min={12}
            max={36}
            step={1}
            format={(v) => String(v)}
            onChange={(v) => setOptions({ galleryCount: v })}
            help="Tiles cycle through your projects (featured first) to fill the three walls. Fewer tiles = lighter on the GPU."
          />
          <Slider
            label="Mirror — panes"
            value={options.mirrorCount}
            min={5}
            max={7}
            step={1}
            format={(v) => String(v)}
            onChange={(v) => setOptions({ mirrorCount: v })}
          />
          <Toggle
            label="Timeline — autoplay"
            checked={options.timelineAutoplay}
            onChange={(v) => setOptions({ timelineAutoplay: v })}
            hint="until the pointer takes over"
            help="Off: the timeline waits on the first pose until someone scrubs or presses Space. Always off for reduced motion."
          />
        </div>
      </Section>
    </div>
  );
}
