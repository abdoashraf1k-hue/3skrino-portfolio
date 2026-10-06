import { allCategories as categories } from "@/data/categories";
import type {
  BackupSchedule,
  BentoPattern,
  DisplayFont,
  HomeSection,
  ProjectSeo,
  SectionId,
  SiteConfig,
} from "@/data/site-config";
import {
  asset,
  fail,
  hex,
  num,
  oneOf,
  parseConfigSource,
  readConfig,
  rec,
  text,
  writeConfig,
  writeConfigSource,
  type ConfigSpec,
  bool,
} from "./config-file";
import { validateCinematic, validateHeroVariant } from "./cinematic-file";

/** data/site-config.ts — theme, home layout, content, SEO overrides, backup schedule, hero variant, cinematic toolbox. */

export const SITE_PATH = "data/site-config.ts";
export const SECTION_IDS: readonly SectionId[] = ["marquee", "vertical", "horizontal", "fields", "ai", "about", "contact"];
export const BENTO_PATTERNS: readonly BentoPattern[] = ["mosaic", "editorial", "uniform"];
export const DISPLAY_FONTS: readonly DisplayFont[] = ["anton", "archivo-black", "bebas-neue", "oswald", "inter"];
export const BACKUP_SCHEDULES: readonly BackupSchedule[] = ["off", "daily", "weekly", "monthly"];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function strings(v: unknown, what: string, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v) || !v.every((s): s is string => typeof s === "string")) return fail(`${what} must be a list of text`);
  const out = v.map((s) => s.trim()).filter(Boolean);
  if (out.length > maxItems) fail(`${what}: at most ${maxItems}`);
  if (out.some((s) => s.length > maxLen)) fail(`${what}: each must be ${maxLen} characters or fewer`);
  return out;
}

function sections(v: unknown): HomeSection[] {
  if (!Array.isArray(v)) return fail("layout.sections must be a list");
  const out = v.map((item, i) => {
    const o = rec(item, `Section #${i + 1}`);
    return {
      id: oneOf(o, "id", `Section #${i + 1}`, SECTION_IDS),
      visible: bool(o, "visible", `Section #${i + 1}`),
      pattern: oneOf(o, "pattern", `Section #${i + 1}`, BENTO_PATTERNS, "mosaic"),
    };
  });
  // Every section exactly once — missing ones are appended hidden-safe (visible).
  const seen = new Set<SectionId>();
  const unique = out.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  for (const id of SECTION_IDS) if (!seen.has(id)) unique.push({ id, visible: true, pattern: "mosaic" });
  return unique;
}

export function validateSiteConfig(input: unknown): SiteConfig {
  const o = rec(input, "Site config");

  const t = rec(o.theme, "theme");
  const T = "Theme";
  const colorsIn = rec(t.categoryColors ?? {}, "theme.categoryColors");
  const categoryColors: Record<string, string> = {};
  for (const c of categories) {
    if (colorsIn[c.id] !== undefined) categoryColors[c.id] = hex(colorsIn, c.id, "Category colours");
  }
  const theme = {
    bg: hex(t, "bg", T),
    bgSoft: hex(t, "bgSoft", T),
    fg: hex(t, "fg", T),
    accent: hex(t, "accent", T),
    accent2: hex(t, "accent2", T),
    letterSpacing: num(t, "letterSpacing", T, -0.06, 0.1, 0.005),
    radius: num(t, "radius", T, 0, 24, 1),
    grain: num(t, "grain", T, 0, 0.15, 0.005),
    vignette: num(t, "vignette", T, 0, 1, 0.05),
    displayFont: oneOf(t, "displayFont", T, DISPLAY_FONTS),
    labelFont: oneOf(t, "labelFont", T, DISPLAY_FONTS),
    categoryColors,
  };

  const layout = { sections: sections(rec(o.layout, "layout").sections) };

  const c = rec(o.content, "content");
  const C = "Content";
  const email = text(c, "email", C, 120);
  if (!EMAIL.test(email)) fail("Content: email must be a valid address");
  if (!Array.isArray(c.stats)) fail("Content: stats must be a list");
  const stats = (c.stats as unknown[]).map((s, i) => {
    const so = rec(s, `Stat #${i + 1}`);
    return { value: text(so, "value", `Stat #${i + 1}`, 12), label: text(so, "label", `Stat #${i + 1}`, 24) };
  });
  if (stats.length > 6) fail("Content: at most 6 stats");
  if (!Array.isArray(c.socials)) fail("Content: socials must be a list");
  const socials = (c.socials as unknown[]).map((s, i) => {
    const so = rec(s, `Social #${i + 1}`);
    const href = text(so, "href", `Social #${i + 1}`, 300);
    if (!/^(https?:\/\/|mailto:)\S+$/.test(href)) fail(`Social #${i + 1}: link must be an http(s) or mailto: URL`);
    return { label: text(so, "label", `Social #${i + 1}`, 30), href };
  });
  if (socials.length > 12) fail("Content: at most 12 social links");
  const content = {
    siteTitle: text(c, "siteTitle", C, 90),
    siteDescription: text(c, "siteDescription", C, 300),
    tagline: text(c, "tagline", C, 220),
    email,
    location: text(c, "location", C, 40),
    role: text(c, "role", C, 80),
    aboutParagraphs: strings(c.aboutParagraphs, "About paragraphs", 8, 900),
    aboutHighlight: text(c, "aboutHighlight", C, 600, false),
    stats,
    socials,
    ogImage: asset(c, "ogImage", C, false),
    favicon: asset(c, "favicon", C, false),
  };

  const seoIn = rec(rec(o.seo, "seo").projects ?? {}, "seo.projects");
  const projects: Record<string, ProjectSeo> = {};
  for (const [id, value] of Object.entries(seoIn)) {
    const so = rec(value, `SEO for ${id}`);
    const title = text(so, "title", `SEO for ${id}`, 70, false);
    const description = text(so, "description", `SEO for ${id}`, 200, false);
    if (title || description) projects[id] = { ...(title ? { title } : {}), ...(description ? { description } : {}) };
  }

  const backups = { schedule: oneOf(rec(o.backups, "backups"), "schedule", "Backups", BACKUP_SCHEDULES, "weekly") };

  // Sprint 10: missing in older files / backups → factory defaults.
  const heroVariant = validateHeroVariant(o);
  const cinematic = validateCinematic(o.cinematic);

  return { theme, layout, content, seo: { projects }, backups, heroVariant, cinematic };
}

export const SITE_SPEC: ConfigSpec<SiteConfig> = {
  target: "site-config",
  path: SITE_PATH,
  start: /export const siteConfig\s*:\s*SiteConfig\s*=\s*/,
  validate: validateSiteConfig,
};

export const parseSiteFile = (source: string) => parseConfigSource(SITE_SPEC, source);
export const writeSiteFile = (source: string, config: SiteConfig) => writeConfigSource(SITE_SPEC, source, config);
export const readSite = () => readConfig(SITE_SPEC);
export const writeSite = (input: unknown, message = "admin: update site settings") => writeConfig(SITE_SPEC, input, message);
