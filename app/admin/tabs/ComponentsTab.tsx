"use client";

import type { CSSProperties, ReactNode } from "react";
import { micro, Section, Slider, TabHeader } from "@/components/admin/ui";
import { FONT_FACES } from "@/components/ui/SiteStyle";
import { siteConfig as committed } from "@/data/site-config";
import { useConfigStore } from "../store";

/**
 * A living style guide: the site's building blocks drawn with the draft
 * theme, plus the finish controls that shape all of them.
 */
export default function ComponentsTab() {
  const { site, setSite } = useConfigStore();
  if (!site) return null;
  const t = site.theme;
  const setT = (patch: Partial<typeof t>) => setSite((c) => ({ ...c, theme: { ...c.theme, ...patch } }));
  const d = FONT_FACES[t.displayFont];
  const l = FONT_FACES[t.labelFont];
  // The site's tokens, scoped to the specimen so the admin itself stays as it is.
  const vars = {
    "--s-bg": t.bg,
    "--s-soft": t.bgSoft,
    "--s-fg": t.fg,
    "--s-accent": t.accent,
    "--s-accent2": t.accent2,
    "--s-radius": `${t.radius}px`,
    background: t.bg,
    color: t.fg,
  } as CSSProperties;
  const display: CSSProperties = { fontFamily: d.family, fontWeight: d.weight, letterSpacing: `${t.letterSpacing}em`, textTransform: "uppercase" };
  const label: CSSProperties = { fontFamily: l.family, fontWeight: l.weight, textTransform: "uppercase" };

  return (
    <div>
      <TabHeader title="Components" hint="the building blocks, drawn with your current theme · colours live in admin → Theme, faces in Typography" />

      <Section
        title="Finish"
        onReset={() => setT({ radius: committed.theme.radius, grain: committed.theme.grain, vignette: committed.theme.vignette })}
        help="These shape every component at once. Grain here is the theme's base grain — admin → Effects → Film grain replaces it with a fuller one while on."
      >
        <div className="grid gap-2 md:grid-cols-3">
          <Slider label="Corner radius" min={0} max={24} step={1} format={(v) => `${v}px`} value={t.radius} onChange={(radius) => setT({ radius })} />
          <Slider label="Base grain" min={0} max={0.15} step={0.005} format={(v) => `${Math.round(v * 1000) / 10}%`} value={t.grain} onChange={(grain) => setT({ grain })} />
          <Slider label="Vignette" min={0} max={1} step={0.05} value={t.vignette} onChange={(vignette) => setT({ vignette })} />
        </div>
      </Section>

      <Section title="Specimen">
        <div className="grid gap-px border border-white/10 bg-white/10 lg:grid-cols-2" style={vars}>
          <Cell name="Buttons">
            <div className="flex flex-wrap items-center gap-5">
              <span className="border px-7 py-3.5 font-mono text-[11px] uppercase tracking-widest" style={{ borderColor: t.fg }}>
                View work
              </span>
              <span className="px-7 py-3.5 font-mono text-[11px] uppercase tracking-widest" style={{ background: t.fg, color: t.bg }}>
                View work — hover
              </span>
              <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest opacity-60">
                Showreel
                <span className="inline-flex size-6 items-center justify-center rounded-full border text-[8px]" style={{ borderColor: t.accent, color: t.accent }}>
                  ▶
                </span>
              </span>
            </div>
          </Cell>
          <Cell name="Status pill · timecode">
            <div className="flex flex-wrap items-center gap-6 font-mono text-[11px] uppercase tracking-widest opacity-80">
              <span className="flex items-center gap-2">
                <span className="size-1.5 rounded-full" style={{ background: t.accent }} />
                Available for work — 2026
              </span>
              <span className="flex items-center gap-2" style={{ color: t.accent }}>
                <span className="size-1.5 rounded-full" style={{ background: t.accent2 }} />
                00:00:12:08
              </span>
            </div>
          </Cell>
          <Cell name="Project card">
            <div className="flex gap-4">
              {["Night run", "Desert drive"].map((title, i) => (
                <div key={title} className="relative aspect-[9/16] w-32 overflow-hidden" style={{ borderRadius: `${t.radius}px`, background: t.bgSoft }}>
                  <span className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${i ? t.accent2 : t.accent}55, ${t.bgSoft} 70%)` }} />
                  <span className="absolute inset-x-2 bottom-2 text-sm leading-tight" style={label}>
                    {title}
                  </span>
                  <span className="absolute left-2 top-2 font-mono text-[8px] uppercase tracking-widest opacity-70">0{i + 1}</span>
                </div>
              ))}
            </div>
          </Cell>
          <Cell name="Section header">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">02 — Work</p>
              <p className="mt-2 text-5xl leading-[0.9]" style={display}>
                Horizontal cuts
              </p>
            </div>
          </Cell>
          <Cell name="Chips · badges">
            <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-widest">
              {["Filmed", "Directed", "Edited"].map((b) => (
                <span key={b} className="border px-2 py-1" style={{ borderColor: `${t.fg}33`, borderRadius: `${Math.min(t.radius, 12)}px` }}>
                  {b}
                </span>
              ))}
              <span className="px-2 py-1 font-bold" style={{ background: t.accent, color: t.bg, borderRadius: `${Math.min(t.radius, 12)}px` }}>
                Featured
              </span>
            </div>
          </Cell>
          <Cell name="Marquee">
            <p className="whitespace-nowrap text-3xl opacity-90" style={display}>
              Director <span style={{ color: `${t.accent}66` }}>•</span> Colorist <span style={{ color: `${t.accent}66` }}>•</span> Storyteller
            </p>
          </Cell>
        </div>
      </Section>
    </div>
  );
}

function Cell({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex min-h-40 flex-col justify-between gap-4 p-5" style={{ background: "var(--s-bg)" }}>
      <span className={`${micro} text-[9px] opacity-40`}>{name}</span>
      {children}
    </div>
  );
}
