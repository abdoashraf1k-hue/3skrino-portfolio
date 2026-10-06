import type { CSSProperties } from "react";
import { brandConfig as committed, type BrandConfig, type BrandIcon, type CategoryDef } from "@/data/brand";
import type { RoleStyle } from "@/data/hero-config";
import { NUMBER_BY_KEY } from "@/data/number-registry";
import { TEXT_BY_KEY } from "@/data/text-registry";

/**
 * The brand system's pure resolvers — server-safe (no hooks), so server
 * components, metadata and route handlers can use them. lib/brand.tsx wraps
 * them in hooks that read the live (admin-preview) brand config.
 */

export type Vars = Record<string, string | number>;

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s);

/** Resolve one key against a brand config (works on the server with the committed one). */
export function resolveText(brand: BrandConfig, key: string, vars?: Vars): string {
  const v = brand.text[key] ?? TEXT_BY_KEY.get(key)?.default ?? key;
  return fill(v, vars);
}

/** Server-safe: the committed text, no live preview. */
export const staticText = (key: string, vars?: Vars) => resolveText(committed, key, vars);

export type HeadlinePart = string | { text: string; italic: true };

/** "Vertical / *Cuts.*" → ["Vertical", { text: "Cuts.", italic: true }]. */
export function parseHeadline(s: string): HeadlinePart[] {
  return s
    .split(/\s+\/\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = /^\*(.+)\*$/.exec(line);
      return m ? { text: m[1], italic: true as const } : line;
    });
}

export function resolveNumber(brand: BrandConfig, key: string): number {
  const entry = NUMBER_BY_KEY.get(key);
  const v = brand.numbers[key];
  if (!entry) return typeof v === "number" ? v : 0;
  return typeof v === "number" && Number.isFinite(v) ? Math.min(entry.max, Math.max(entry.min, v)) : entry.default;
}

export const staticNumber = (key: string) => resolveNumber(committed, key);

/** Enabled categories in admin order. */
export const enabledCategories = (brand: BrandConfig): CategoryDef[] => brand.categories.filter((c) => c.enabled);

/** "icon:film" → the icon; anything else is a glyph. */
export function findIcon(brand: BrandConfig, ref: string): BrandIcon | null {
  if (!ref.startsWith("icon:")) return null;
  return brand.icons.find((i) => i.id === ref.slice(5)) ?? null;
}

const EASING = /^(?:linear|ease|ease-in|ease-out|ease-in-out|cubic-bezier\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\))$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9-]+$/;
const clamp = (v: number, min: number, max: number, f: number) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : f);

/**
 * The brand's tokens as custom properties. Values are re-checked because
 * preview drafts arrive unvalidated. Category colours here are the defaults —
 * Theme / palette overrides (themeCss) come later in the cascade and win.
 */
export function brandCss(brand: BrandConfig, themeCategoryColors: Record<string, string> = {}): string {
  const f = committed;
  const s = brand.scale;
  const unit = clamp(s.unit, 2, 12, f.scale.unit);
  const steps = (Array.isArray(s.steps) ? s.steps : f.scale.steps).map((n, i) => `--space-${i}:${(clamp(n, 0, 64, 0) * unit) / 16}rem`);
  const base = clamp(s.typeBase, 12, 22, f.scale.typeBase);
  const ratio = clamp(s.typeRatio, 1.1, 1.618, f.scale.typeRatio);
  const type = [-2, -1, 0, 1, 2, 3, 4, 5, 6].map((k) => `--step-${k < 0 ? `n${-k}` : k}:${((base * ratio ** k) / 16).toFixed(4)}rem`);
  const m = brand.motion;
  const ease = EASING.test(m.ease) ? m.ease : f.motion.ease;
  const easeInOut = EASING.test(m.easeInOut) ? m.easeInOut : f.motion.easeInOut;
  const st = brand.states;
  const tokens = [
    ...steps,
    ...type,
    `--radius-sm:${clamp(s.radius.sm, 0, 40, 2)}px`,
    `--radius-md:${clamp(s.radius.md, 0, 40, 6)}px`,
    `--radius-lg:${clamp(s.radius.lg, 0, 60, 14)}px`,
    `--grid-columns:${clamp(s.grid.columns, 4, 24, 12)}`,
    `--grid-gutter:${clamp(s.grid.gutter, 0, 80, 24)}px`,
    `--grid-max:${clamp(s.grid.maxWidth, 960, 2560, 1600)}px`,
    `--dur-fast:${clamp(m.fast, 40, 600, 160)}ms`,
    `--dur-base:${clamp(m.base, 80, 1200, 320)}ms`,
    `--dur-slow:${clamp(m.slow, 200, 2400, 700)}ms`,
    `--dur-cinematic:${clamp(m.cinematic, 400, 4000, 1200)}ms`,
    `--ease-out:${ease}`,
    `--ease-in-out:${easeInOut}`,
    `--hover-lift:${clamp(st.hoverLift, 0, 8, 2)}px`,
    `--press-scale:${clamp(st.pressScale, 0.9, 1, 0.97)}`,
    `--focus-width:${clamp(st.focusWidth, 1, 4, 2)}px`,
    `--focus-offset:${clamp(st.focusOffset, 0, 6, 3)}px`,
  ];
  const cats = brand.categories
    .filter((c) => ID.test(c.id) && HEX.test(c.color) && !HEX.test(themeCategoryColors[c.id] ?? ""))
    .map((c) => `[data-cat="${c.id}"]{--cat:${c.color}}`)
    .join("");
  return `:root{${tokens.join(";")}}${cats}`;
}

/** Inline style for a role's text (admin → Roles). Colour/weight only when set. */
export function roleStyle(look: RoleStyle | undefined): CSSProperties | undefined {
  if (!look) return undefined;
  const style: CSSProperties = {};
  if (HEX.test(look.color)) style.color = look.color;
  if (look.weight && look.weight !== 900) style.fontWeight = look.weight;
  return Object.keys(style).length ? style : undefined;
}
