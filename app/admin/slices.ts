import type { BrandConfig } from "@/data/brand";
import type { HeroConfig } from "@/data/hero-config";
import type { SiteConfig } from "@/data/site-config";

/**
 * Which part of which config each admin tab edits. One table drives the
 * sidebar's unsaved dots, the per-tab save bar and its "Discard tab".
 */

export type ConfigFile = "hero" | "site" | "brand";
export type Slice = { file: ConfigFile; path: readonly string[]; name: string };

const site = (path: string[], name: string): Slice => ({ file: "site", path, name });
const hero = (path: string[], name: string): Slice => ({ file: "hero", path, name });
const brand = (path: string[], name: string): Slice => ({ file: "brand", path, name });

export const TAB_SLICES: Record<string, readonly Slice[]> = {
  hero: [
    hero(["poses"], "poses"),
    hero(["expressions"], "expressions"),
    hero(["confrontation"], "confrontation"),
    hero(["features"], "hero effects"),
    hero(["ambientSrc"], "ambient sound"),
  ],
  brands: [hero(["logos"], "brands")],
  roles: [hero(["roles"], "roles")],
  interview: [hero(["interview"], "interview")],
  heroes: [site(["heroVariant"], "hero variant"), site(["cinematic", "heroOptions"], "hero options")],
  effects: [site(["cinematic", "effects"], "effects"), site(["cinematic", "scopes"], "effect scopes"), site(["cinematic", "lutProjects"], "project grades")],
  experiments: [site(["cinematic", "experiments"], "experiments")],
  cursor: [site(["cinematic", "cursor"], "cursor")],
  sound: [site(["cinematic", "sound"], "sound")],
  motion: [site(["cinematic", "motion"], "motion")],
  sections: [site(["cinematic", "sections"], "section fx")],
  layout: [site(["layout"], "layout")],
  theme: [site(["theme"], "theme"), brand(["palettes"], "palettes")],
  typography: [site(["theme", "displayFont"], "display font"), site(["theme", "labelFont"], "label font"), site(["theme", "letterSpacing"], "letter spacing")],
  components: [site(["theme", "radius"], "corner radius"), site(["theme", "grain"], "grain"), site(["theme", "vignette"], "vignette")],
  content: [site(["content"], "content")],
  social: [site(["content", "socials"], "social links")],
  seo: [site(["seo"], "SEO")],
  backups: [site(["backups"], "backup schedule")],
  settings: [site(["storage"], "storage")],
  brand: [
    brand(["identity"], "identity"),
    brand(["voice"], "voice"),
    brand(["scale"], "scale"),
    brand(["motion"], "motion tokens"),
    brand(["states"], "interaction states"),
    brand(["principles"], "principles"),
    brand(["signature"], "signature moments"),
  ],
  categories: [brand(["categories"], "categories")],
  text: [brand(["text"], "text")],
  numbers: [brand(["numbers"], "numbers")],
  icons: [brand(["icons"], "icons")],
};

export function getIn(obj: unknown, path: readonly string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** Immutable set: copies every object along `path`. */
export function setIn<T>(obj: T, path: readonly string[], value: unknown): T {
  if (!path.length) return value as T;
  const [k, ...rest] = path;
  const base = (typeof obj === "object" && obj !== null ? obj : {}) as Record<string, unknown>;
  return { ...base, [k]: setIn(base[k], rest, value) } as T;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export type Configs = {
  savedHero: HeroConfig | null;
  hero: HeroConfig | null;
  savedSite: SiteConfig | null;
  site: SiteConfig | null;
  savedBrand: BrandConfig | null;
  brand: BrandConfig | null;
};

/** [saved, draft] for one file. */
export function pairOf(file: ConfigFile, s: Configs): [unknown, unknown] {
  if (file === "hero") return [s.savedHero, s.hero];
  if (file === "site") return [s.savedSite, s.site];
  return [s.savedBrand, s.brand];
}

/** Names of this tab's slices that differ from what's saved. */
export function dirtyIn(tab: string, s: Configs): string[] {
  return (TAB_SLICES[tab] ?? [])
    .filter((sl) => {
      const [saved, draft] = pairOf(sl.file, s);
      return saved && draft && !same(getIn(saved, sl.path), getIn(draft, sl.path));
    })
    .map((sl) => sl.name);
}
