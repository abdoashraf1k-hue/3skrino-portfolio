"use client";

import type { BrandIcon as BrandIconDef, CategoryDef } from "@/data/brand";
import { useBrandConfig } from "@/lib/live-config";
import { enabledCategories, findIcon, resolveNumber, resolveText, type Vars } from "./brand-core";

// Explicit (Next forbids `export *` across a client boundary). Server code imports ./brand-core directly.
export { brandCss, enabledCategories, findIcon, parseHeadline, resolveNumber, resolveText, roleStyle, staticNumber, staticText } from "./brand-core";
export type { HeadlinePart, Vars } from "./brand-core";

/**
 * The brand system at runtime. Text and numbers resolve override → registry
 * default; tokens become CSS custom properties; icons render from one place.
 * Everything reads the live brand config, so the admin preview updates as
 * you type.
 */

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

export function useText(): (key: string, vars?: Vars) => string {
  const brand = useBrandConfig();
  return (key, vars) => resolveText(brand, key, vars);
}

/** Inline text from the registry — drop it into server components too; it previews live. */
export function T({ k, vars }: { k: string; vars?: Vars }) {
  return <>{useText()(k, vars)}</>;
}

/* ------------------------------------------------------------------ */
/* Numbers                                                             */
/* ------------------------------------------------------------------ */

export function useNumbers(): (key: string) => number {
  const brand = useBrandConfig();
  return (key) => resolveNumber(brand, key);
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export function useCategories(): CategoryDef[] {
  return enabledCategories(useBrandConfig());
}

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

/**
 * One icon, coloured by `currentColor`: SVGs render as a CSS mask so line
 * icons from any source take the text colour; glyphs render as text.
 */
export function IconView({ icon, size = 16, className = "", label }: { icon: BrandIconDef | string; size?: number; className?: string; label?: string }) {
  const def = typeof icon === "string" ? null : icon;
  const glyph = typeof icon === "string" ? icon : icon.source === "glyph" ? icon.value : null;
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  if (glyph !== null) {
    return (
      <span {...a11y} className={`inline-flex items-center justify-center leading-none ${className}`} style={{ width: size, height: size, fontSize: size * 0.9 }}>
        {glyph}
      </span>
    );
  }
  const url = `url("${def?.value.replace(/"/g, "%22")}")`;
  return (
    <span
      {...a11y}
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{ width: size, height: size, maskImage: url, WebkitMaskImage: url, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }}
    />
  );
}

/** A glyph or an "icon:<id>" reference from the brand's icon set. */
export function BrandIcon({ value, size, className, label }: { value: string; size?: number; className?: string; label?: string }) {
  const brand = useBrandConfig();
  if (!value) return null;
  const icon = findIcon(brand, value);
  if (value.startsWith("icon:") && !icon) return null;
  return <IconView icon={icon ?? value} size={size} className={className} label={label} />;
}

/* ------------------------------------------------------------------ */
/* Tokens → CSS                                                        */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Roles                                                               */
/* ------------------------------------------------------------------ */

