import { heroConfig, type BrandLogo } from "@/data/hero-config";
import { projects, type Project } from "@/data/projects";

/**
 * Sprint 13 — the brand ecosystem. A brand is a hero logo (admin → Brands,
 * stored in data/hero-config.ts) plus every project that points at it with
 * `project.brandId` (admin → project editor → Brand, stored in
 * data/projects.ts).
 *
 * `projectIds` is derived, never stored: the link lives on the project only,
 * so assigning / re-assigning / deleting a project can't leave a brand's list
 * stale, and saving a project is still one commit to one file.
 */

export type Brand = {
  id: string;
  name: string;
  logoUrl: string;
  /** Projects whose `brandId` is this brand, in data/projects.ts order. */
  projectIds: string[];
  /** Shown in the hero (the logo's visibility switch). */
  isActive: boolean;
};

/** Builds brands from any logo list (the live admin draft or the committed config). */
export function buildBrands(logos: readonly BrandLogo[], list: readonly Project[] = projects): Brand[] {
  const byBrand = new Map<string, string[]>();
  for (const p of list) {
    if (!p.brandId) continue;
    const ids = byBrand.get(p.brandId);
    if (ids) ids.push(p.id);
    else byBrand.set(p.brandId, [p.id]);
  }
  return logos.map((logo) => ({
    id: logo.id,
    name: logo.name,
    logoUrl: logo.imageUrl,
    projectIds: byBrand.get(logo.id) ?? [],
    isActive: logo.visible,
  }));
}

export const brands: Brand[] = buildBrands(heroConfig.logos.items);

export function getBrand(id: string): Brand | undefined {
  return brands.find((b) => b.id === id);
}

/** Brands a visitor can filter by: at least one project behind them. */
export const brandsWithProjects = brands.filter((b) => b.projectIds.length > 0);

export function projectsForBrand(id: string, list: readonly Project[] = projects): Project[] {
  return list.filter((p) => p.brandId === id);
}

/** The brand-filtered reels page. */
export const brandHref = (id: string) => `/reels?brand=${encodeURIComponent(id)}`;
