"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { card, input, micro, Section, Slider, TabHeader } from "@/components/admin/ui";
import { FONT_FACES } from "@/components/ui/SiteStyle";
import { siteConfig as committed, type DisplayFont } from "@/data/site-config";
import { useConfigStore } from "../store";

const PAIRS: { name: string; display: DisplayFont; label: DisplayFont; note: string }[] = [
  { name: "House", display: "anton", label: "archivo-black", note: "condensed headlines, heavy labels" },
  { name: "Poster", display: "bebas-neue", label: "inter", note: "tall caps, quiet labels" },
  { name: "Brutal", display: "archivo-black", label: "oswald", note: "wide and loud" },
  { name: "Editorial", display: "oswald", label: "inter", note: "magazine spread" },
  { name: "Minimal", display: "inter", label: "inter", note: "one family, many weights" },
];

const FONTS = Object.keys(FONT_FACES) as DisplayFont[];

/**
 * Typography as a type designer sees it: pairings, the whole scale set in
 * your faces, editable sample text. (Admin → Theme keeps the plain pickers;
 * both edit the same three settings.)
 */
export default function TypographyTab() {
  const { site, setSite } = useConfigStore();
  const [sample, setSample] = useState("Cut to the beat");
  if (!site) return null;
  const t = site.theme;
  const setT = (patch: Partial<typeof t>) => setSite((c) => ({ ...c, theme: { ...c.theme, ...patch } }));
  const d = FONT_FACES[t.displayFont];
  const l = FONT_FACES[t.labelFont];
  const display: CSSProperties = { fontFamily: d.family, fontWeight: d.weight, letterSpacing: `${t.letterSpacing}em`, textTransform: "uppercase" };
  const label: CSSProperties = { fontFamily: l.family, fontWeight: l.weight, textTransform: "uppercase" };

  return (
    <div>
      <TabHeader title="Typography" hint="the two faces that carry the site's voice · body text stays Inter, data stays JetBrains Mono" />

      <Section
        title="Pairings"
        onReset={() => setT({ displayFont: committed.theme.displayFont, labelFont: committed.theme.labelFont, letterSpacing: committed.theme.letterSpacing })}
        help="A pairing sets the headline face and the label face together. Reset goes back to what's currently published."
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {PAIRS.map((p) => {
            const on = t.displayFont === p.display && t.labelFont === p.label;
            const pd = FONT_FACES[p.display];
            const pl = FONT_FACES[p.label];
            return (
              <button
                key={p.name}
                type="button"
                aria-pressed={on}
                onClick={() => setT({ displayFont: p.display, labelFont: p.label })}
                className={`${card} flex flex-col gap-2 p-3 text-left ${on ? "border-[#e7fe55]" : "hover:border-white/30"}`}
              >
                <span className="text-3xl uppercase leading-none" style={{ fontFamily: pd.family, fontWeight: pd.weight }}>
                  Night run
                </span>
                <span className="text-sm uppercase" style={{ fontFamily: pl.family, fontWeight: pl.weight }}>
                  Brand film · 2026
                </span>
                <span className={`${micro} text-[9px] ${on ? "text-[#e7fe55]" : "text-white/40"}`}>
                  {p.name} — {p.note}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <div className="grid gap-8 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Section title="Faces">
          <div className="flex flex-col gap-3">
            <label className="block">
              <span className={`${micro} mb-1 block text-white/50`}>Headline face</span>
              <select value={t.displayFont} onChange={(e) => setT({ displayFont: e.target.value as DisplayFont })} className={input}>
                {FONTS.map((f) => (
                  <option key={f} value={f}>
                    {FONT_FACES[f].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={`${micro} mb-1 block text-white/50`}>Label face</span>
              <select value={t.labelFont} onChange={(e) => setT({ labelFont: e.target.value as DisplayFont })} className={input}>
                {FONTS.map((f) => (
                  <option key={f} value={f}>
                    {FONT_FACES[f].label}
                  </option>
                ))}
              </select>
            </label>
            <Slider
              label="Headline tracking"
              min={-0.06}
              max={0.1}
              step={0.005}
              format={(v) => `${v.toFixed(3)}em`}
              value={t.letterSpacing}
              onChange={(v) => setT({ letterSpacing: v })}
              help="Letter spacing for the big display type. Condensed faces like Anton read best slightly tight (−0.01); wide faces want 0 or above."
            />
            <label className="block">
              <span className={`${micro} mb-1 block text-white/50`}>Sample text</span>
              <input value={sample} onChange={(e) => setSample(e.target.value)} className={input} maxLength={60} />
            </label>
          </div>
        </Section>

        <Section title="Scale" hint="every level, set in your faces">
          <div className="flex flex-col gap-5 border border-white/10 bg-[#0a0a0a] p-6">
            <Row tag="Hero · clamp(4.5rem, 17vw, 18rem)">
              <span className="block truncate text-[clamp(3rem,7vw,6.5rem)] leading-[0.86]" style={display}>
                {sample || "3SKRINO"}
              </span>
            </Row>
            <Row tag="Section title · 6xl">
              <span className="block text-6xl leading-[0.9]" style={display}>
                Vertical cuts
              </span>
            </Row>
            <Row tag="Card title · label face">
              <span className="block text-2xl" style={label}>
                {sample || "Night run"}
              </span>
            </Row>
            <Row tag="Body · Inter">
              <span className="block max-w-xl text-lg leading-snug text-white/75">Senior video editor and content creator — brand films, commercials, social reels and AI-driven visuals.</span>
            </Row>
            <Row tag="Data · JetBrains Mono">
              <span className="block font-mono text-[11px] uppercase tracking-widest text-white/50">00:01:23:12 · 25 fps · Premiere Pro</span>
            </Row>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Row({ tag, children }: { tag: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-white/5 pb-4 last:border-0 last:pb-0">
      <span className={`${micro} text-[9px] text-white/30`}>{tag}</span>
      {children}
    </div>
  );
}
