import pack from "@/public/heroes/heroes.json";

/**
 * The interactive hero pack served from public/heroes/ (admin → Heroes →
 * Pack heroes). public/heroes/heroes.json is the single list of heroes; each
 * one is a standalone page at /heroes/<file>, embedded on the home page in an
 * iframe when site-config's activeHero names it.
 */

export type PackHero = {
  id: string;
  title: string;
  description: string;
  /** Page, relative to /heroes/ (e.g. "heroes/depth.html"). */
  file: string;
  /** 960×540 screenshot, relative to /heroes/. */
  thumbnail: string;
  /** 390×844 phone screenshot (the portrait layout), relative to /heroes/. */
  thumbnailPortrait: string;
};

/** "default" = the hero the site already has (site-config heroVariant). */
export const DEFAULT_ACTIVE_HERO = "default";

export const PACK_HEROES: readonly PackHero[] = pack.heroes.map(({ id, title, description, file, thumbnail, thumbnail_portrait }) => ({
  id,
  title,
  description,
  file,
  thumbnail,
  thumbnailPortrait: thumbnail_portrait,
}));

export const ACTIVE_HERO_IDS: readonly string[] = [DEFAULT_ACTIVE_HERO, ...PACK_HEROES.map((h) => h.id)];

export const packHero = (id: string | null | undefined): PackHero | null => PACK_HEROES.find((h) => h.id === id) ?? null;

export const packHeroUrl = (h: PackHero, query = ""): string => `/heroes/${h.file}${query}`;
export const packThumbUrl = (h: PackHero): string => `/heroes/${h.thumbnail}`;
export const packPortraitThumbUrl = (h: PackHero): string => `/heroes/${h.thumbnailPortrait}`;

/**
 * When a hero shows its portrait layout. Must match the runtime's rule
 * (public/heroes/runtime/dc-lite.js: width / height < 1.1).
 */
export const PORTRAIT_MEDIA = "(max-aspect-ratio: 11/10)";
export const LANDSCAPE_MEDIA = "(min-aspect-ratio: 11/10)";
