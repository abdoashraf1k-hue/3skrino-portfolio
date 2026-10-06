"use client";

import { siteConfig as committed, type DisplayFont, type SiteTheme } from "@/data/site-config";
import { brandCss } from "@/lib/brand";
import { useBrandConfig, useSiteConfig } from "@/lib/live-config";

/** Each face at the weight it was drawn for (Anton / Bebas / Archivo Black ship one weight). */
export const FONT_FACES: Record<DisplayFont, { family: string; weight: number; label: string }> = {
  anton: { family: 'var(--font-anton), "Arial Narrow", sans-serif', weight: 400, label: "Anton" },
  "archivo-black": { family: "var(--font-archivo), var(--font-inter), sans-serif", weight: 400, label: "Archivo Black" },
  "bebas-neue": { family: 'var(--font-bebas), "Arial Narrow", sans-serif', weight: 400, label: "Bebas Neue" },
  oswald: { family: 'var(--font-oswald), "Arial Narrow", sans-serif', weight: 700, label: "Oswald" },
  inter: { family: "var(--font-inter), system-ui, sans-serif", weight: 900, label: "Inter Black" },
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9-]+$/;

/** Theme → CSS. Values are re-checked here because preview drafts arrive unvalidated. */
export function themeCss(theme: SiteTheme): string {
  const fallback = committed.theme;
  const c = (v: string, f: string) => (HEX.test(v) ? v : f);
  const n = (v: number, min: number, max: number, f: number) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : f);
  const display = FONT_FACES[theme.displayFont] ?? FONT_FACES.anton;
  const label = FONT_FACES[theme.labelFont] ?? FONT_FACES["archivo-black"];
  const accent = c(theme.accent, fallback.accent);

  const cats = Object.entries(theme.categoryColors ?? {})
    .filter(([id, color]) => ID.test(id) && HEX.test(color))
    .map(([id, color]) => `[data-cat="${id}"]{--cat:${color}}`)
    .join("");

  return [
    // Surfaces apply to the dark theme only; the light theme keeps its own.
    `:root:not([data-theme="light"]){--bg:${c(theme.bg, fallback.bg)};--bg-soft:${c(theme.bgSoft, fallback.bgSoft)};--fg:${c(theme.fg, fallback.fg)};--accent-ink:${accent};--accent-2:${c(theme.accent2, fallback.accent2)}}`,
    `:root{--accent:${accent};--display-family:${display.family};--display-weight:${display.weight};--display-tracking:${n(theme.letterSpacing, -0.06, 0.1, -0.01)}em;--label-family:${label.family};--label-weight:${label.weight};--radius-card:${n(theme.radius, 0, 24, 2)}px;--grain-opacity:${n(theme.grain, 0, 0.15, 0.03)};--vignette:${n(theme.vignette, 0, 1, 0.35)}}`,
    cats,
  ].join("");
}

/**
 * The site theme as CSS custom properties. Server-rendered from the committed
 * config (no flash); in the admin's preview iframe it re-renders on every
 * draft change, so colours, fonts and finish update live.
 */
export default function SiteStyle() {
  const { theme } = useSiteConfig();
  const brand = useBrandConfig();
  return (
    <>
      {/* Brand tokens (data/brand.ts): spacing, type scale, motion, states, default category colours. */}
      <style id="brand-tokens" dangerouslySetInnerHTML={{ __html: brandCss(brand, theme.categoryColors) }} />
      <style id="site-theme" dangerouslySetInnerHTML={{ __html: themeCss(theme) }} />
      {/* Vignette: darkens the screen edges; strength from the theme. */}
      <div
        aria-hidden
        className="site-vignette pointer-events-none fixed inset-0 z-[89]"
        style={{ background: "radial-gradient(120% 90% at 50% 45%, transparent 55%, rgb(0 0 0 / 0.55) 100%)" }}
      />
    </>
  );
}
