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
};

/** "default" = the hero the site already has (site-config heroVariant). */
export const DEFAULT_ACTIVE_HERO = "default";

export const PACK_HEROES: readonly PackHero[] = pack.heroes.map(({ id, title, description, file, thumbnail }) => ({
  id,
  title,
  description,
  file,
  thumbnail,
}));

export const ACTIVE_HERO_IDS: readonly string[] = [DEFAULT_ACTIVE_HERO, ...PACK_HEROES.map((h) => h.id)];

export const packHero = (id: string | null | undefined): PackHero | null => PACK_HEROES.find((h) => h.id === id) ?? null;

export const packHeroUrl = (h: PackHero, query = ""): string => `/heroes/${h.file}${query}`;
export const packThumbUrl = (h: PackHero): string => `/heroes/${h.thumbnail}`;
