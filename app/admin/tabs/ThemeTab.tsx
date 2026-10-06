"use client";

import { useState } from "react";
import { slugify, uniqueId } from "@/components/admin/fields";
import { btn, card, ColorField, input, micro, Section, Slider, TabHeader } from "@/components/admin/ui";
import { FONT_FACES } from "@/components/ui/SiteStyle";
import type { BrandPalette } from "@/data/brand";
import { siteConfig as committed, type DisplayFont, type SiteTheme } from "@/data/site-config";
import { useConfigStore } from "../store";

const COLORS: { key: "bg" | "bgSoft" | "fg" | "accent" | "accent2"; label: string; css: string }[] = [
  { key: "bg", label: "Background", css: "--bg" },
  { key: "bgSoft", label: "Background soft", css: "--bg-soft" },
  { key: "fg", label: "Foreground", css: "--fg" },
  { key: "accent", label: "Accent", css: "--accent" },
  { key: "accent2", label: "Accent 2 (REC red)", css: "--accent-2" },
];

/** One-click palettes (dark theme). */
const PRESETS: { name: string; colors: Pick<SiteTheme, "bg" | "bgSoft" | "fg" | "accent" | "accent2"> }[] = [
  { name: "Lime (house)", colors: { bg: "#0a0a0a", bgSoft: "#141414", fg: "#f5f5f5", accent: "#e7fe55", accent2: "#ff2d2d" } },
  { name: "Ember", colors: { bg: "#0b0806", bgSoft: "#16100c", fg: "#f6efe8", accent: "#ff7a1a", accent2: "#ff2d55" } },
  { name: "Ice", colors: { bg: "#06090c", bgSoft: "#0e1418", fg: "#eef6fb", accent: "#5fe3ff", accent2: "#ff4d6d" } },
  { name: "Ultraviolet", colors: { bg: "#08060c", bgSoft: "#120e19", fg: "#f2eefb", accent: "#b69cff", accent2: "#ff3df0" } },
  { name: "Mono", colors: { bg: "#0a0a0a", bgSoft: "#151515", fg: "#f2f2f2", accent: "#ffffff", accent2: "#9a9a9a" } },
];

const FONTS = Object.keys(FONT_FACES) as DisplayFont[];

function FontPicker({ label, value, onChange, sample }: { label: string; value: DisplayFont; onChange: (f: DisplayFont) => void; sample: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {FONTS.map((f) => {
        const face = FONT_FACES[f];
        const on = value === f;
        return (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(f)}
            className={`flex flex-col items-start gap-1 border px-4 py-3 text-left transition-colors ${
              on ? "border-[#e7fe55] bg-[#e7fe55]/[0.04]" : "border-white/10 hover:border-white/30"
            }`}
          >
            <span className="text-[2.1rem] uppercase leading-[0.95]" style={{ fontFamily: face.family, fontWeight: face.weight }}>
              {sample}
            </span>
            <span className={`${micro} text-[9px] ${on ? "text-[#e7fe55]" : "text-white/40"}`}>{face.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function ThemeTab() {
  const { site, setSite, brand, setBrand } = useConfigStore();
  const [name, setName] = useState("");
  if (!site || !brand) return null;
  const t = site.theme;
  const set = <K extends keyof SiteTheme>(k: K, v: SiteTheme[K]) => setSite((c) => ({ ...c, theme: { ...c.theme, [k]: v } }));
  const categories = brand.categories;
  const palettes = brand.palettes;
  const fromTheme = (id: string, label: string): BrandPalette => ({
    id,
    name: label,
    bg: t.bg,
    bgSoft: t.bgSoft,
    fg: t.fg,
    accent: t.accent,
    accent2: t.accent2,
    categoryColors: { ...t.categoryColors },
  });
  /** Instant switch: the palette's colours (and any per-category colours it carries) become the theme. */
  const apply = (p: BrandPalette) => {
    setSite((c) => ({
      ...c,
      theme: {
        ...c.theme,
        bg: p.bg,
        bgSoft: p.bgSoft,
        fg: p.fg,
        accent: p.accent,
        accent2: p.accent2,
        categoryColors: Object.keys(p.categoryColors).length ? { ...p.categoryColors } : c.theme.categoryColors,
      },
    }));
    setBrand((c) => ({ ...c, palettes: { ...c.palettes, active: p.id } }));
  };
  const setPalettes = (fn: (items: BrandPalette[]) => BrandPalette[]) => setBrand((c) => ({ ...c, palettes: { ...c.palettes, items: fn(c.palettes.items) } }));
  const isLive = (p: BrandPalette) => p.bg === t.bg && p.fg === t.fg && p.accent === t.accent && p.accent2 === t.accent2 && p.bgSoft === t.bgSoft;

  return (
    <div>
      <TabHeader
        title="Theme"
        hint="colours, type and finish for the whole site · applies to the dark theme (the light theme keeps its palette) · live in the dock"
        actions={
          <button type="button" className={btn} onClick={() => setSite((c) => ({ ...c, theme: committed.theme }))}>
            Reset to committed
          </button>
        }
      />

      <Section title="Palettes" hint="your saved palettes (data/brand.ts) · Apply switches the whole site instantly, category colours included">
        <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {palettes.items.map((p) => (
            <div key={p.id} className={`${card} flex flex-col gap-2 p-3 ${isLive(p) ? "border-[#e7fe55]/60" : ""}`}>
              <div className="flex h-10 overflow-hidden">
                {[p.bg, p.bgSoft, p.fg, p.accent, p.accent2].map((c, i) => (
                  <span key={i} className="flex-1" style={{ background: c }} />
                ))}
              </div>
              {Object.keys(p.categoryColors).length > 0 && (
                <div className="flex h-2 overflow-hidden" title="category colours">
                  {Object.values(p.categoryColors).map((c, i) => (
                    <span key={i} className="flex-1" style={{ background: c }} />
                  ))}
                </div>
              )}
              <input aria-label="Palette name" className={input} value={p.name} maxLength={40} onChange={(e) => setPalettes((l) => l.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))} />
              <div className="flex flex-wrap gap-1">
                <button type="button" className={`${btn} ${isLive(p) ? "border-[#e7fe55] text-[#e7fe55]" : ""}`} onClick={() => apply(p)}>
                  {isLive(p) ? "Live" : "Apply"}
                </button>
                <button type="button" className={btn} title="Overwrite with the current theme colours" onClick={() => setPalettes((l) => l.map((x) => (x.id === p.id ? fromTheme(p.id, p.name) : x)))}>
                  Update
                </button>
                <button type="button" className={`${btn} hover:border-[#ff2d2d] hover:text-[#ff6b6b]`} disabled={palettes.items.length <= 1} onClick={() => setPalettes((l) => l.filter((x) => x.id !== p.id))}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
        <form
          className="flex max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const label = name.trim();
            if (!label) return;
            const id = uniqueId(slugify(label, "palette"), new Set(palettes.items.map((p) => p.id)));
            setPalettes((l) => [...l, fromTheme(id, label)]);
            setBrand((c) => ({ ...c, palettes: { ...c.palettes, active: id } }));
            setName("");
          }}
        >
          <input className={input} value={name} maxLength={40} placeholder="Save current colours as…" onChange={(e) => setName(e.target.value)} />
          <button type="submit" className={btn} disabled={!name.trim() || palettes.items.length >= 24}>
            Save palette
          </button>
        </form>
      </Section>

      <Section title="Colours" hint="quick presets replace the five colours below">
        <div className="mb-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => setSite((c) => ({ ...c, theme: { ...c.theme, ...p.colors } }))}
              className="flex items-center gap-2 border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-white/70 hover:border-white/30"
            >
              <span className="flex">
                {[p.colors.bg, p.colors.fg, p.colors.accent, p.colors.accent2].map((c, i) => (
                  <span key={i} className="-ml-1 size-4 rounded-full border border-black/40 first:ml-0" style={{ background: c }} />
                ))}
              </span>
              {p.name}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {COLORS.map((c) => (
            <ColorField key={c.key} label={c.label} value={t[c.key]} onChange={(v) => set(c.key, v)} />
          ))}
        </div>
        {/* Contrast hint for body text. */}
        <p className={`${micro} mt-3 text-white/35`}>
          Sample:{" "}
          <span className="px-2 py-1" style={{ background: t.bg, color: t.fg }}>
            Body on background
          </span>{" "}
          <span className="px-2 py-1" style={{ background: t.bg, color: t.accent }}>
            Accent text
          </span>{" "}
          <span className="px-2 py-1" style={{ background: t.accent, color: t.bg }}>
            On accent
          </span>
        </p>
      </Section>

      <Section
        title="Display font"
        hint="the big cinematic headlines — VERTICAL CUTS, LET'S CREATE · Anton is the house face; wide faces (Archivo Black, Inter) can overflow the largest headlines"
      >
        <FontPicker label="Display font" value={t.displayFont} onChange={(f) => set("displayFont", f)} sample="Let's Create" />
      </Section>

      <Section title="Label font" hint="small bold text — card titles, process steps">
        <FontPicker label="Label font" value={t.labelFont} onChange={(f) => set("labelFont", f)} sample="Night Run" />
      </Section>

      <Section title="Finish">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Slider
            label="Letter spacing"
            hint="display headlines"
            min={-0.06}
            max={0.1}
            step={0.005}
            format={(v) => `${v.toFixed(3)}em`}
            value={t.letterSpacing}
            onChange={(v) => set("letterSpacing", v)}
          />
          <Slider label="Corner radius" hint="cards + tiles" min={0} max={24} step={1} format={(v) => `${v}px`} value={t.radius} onChange={(v) => set("radius", v)} />
          <Slider label="Film grain" min={0} max={0.15} step={0.005} format={(v) => `${Math.round(v * 1000) / 10}%`} value={t.grain} onChange={(v) => set("grain", v)} />
          <Slider label="Vignette" min={0} max={1} step={0.05} value={t.vignette} onChange={(v) => set("vignette", v)} />
        </div>
      </Section>

      <Section title="Category colours" hint="overrides on top of each category's own colour (admin → Categories) · saved into palettes">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {categories.map((c) => (
            <ColorField
              key={c.id}
              label={c.name}
              value={t.categoryColors[c.id] ?? c.color}
              onChange={(v) => setSite((s) => ({ ...s, theme: { ...s.theme, categoryColors: { ...s.theme.categoryColors, [c.id]: v } } }))}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}
