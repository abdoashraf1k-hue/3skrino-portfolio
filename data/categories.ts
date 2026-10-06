import { brandConfig } from "./brand";
import { projects, reels } from "./projects";

/**
 * Categories are managed in admin → Categories (data/brand.ts → categories):
 * name, slug, description, colour, emoji, order and an on/off switch.
 * Counts are derived from the data so they never drift.
 */

export type Category = {
  id: string;
  name: string;
  count: number;
  description: string;
  color: string;
  emoji: string;
  enabled: boolean;
};

/** Every category, disabled ones included — projects may still point at them (admin pickers, validation). */
export const allCategories: Category[] = brandConfig.categories.map((c) => ({
  ...c,
  count: c.id === "reels" ? reels.length : projects.filter((p) => p.category === c.id).length,
}));

/** The public list: enabled categories in admin order. */
export const categories: Category[] = allCategories.filter((c) => c.enabled);

/** Any category by slug (disabled ones still resolve, so a project's label never disappears). */
export function getCategory(id: string): Category | undefined {
  return allCategories.find((c) => c.id === id);
}
