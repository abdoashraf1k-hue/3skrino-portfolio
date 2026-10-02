import { projects, reels } from "./projects";

export type Category = {
  id: string;
  name: string;
  count: number;
  description: string;
};

const base: Omit<Category, "count">[] = [
  { id: "sports", name: "Sports", description: "Campaigns, match-day edits and athlete stories cut for energy." },
  { id: "corporate", name: "Corporate", description: "Brand films and documentaries that make companies feel human." },
  { id: "restaurants", name: "Restaurants", description: "Food films with texture, heat and appetite." },
  { id: "fashion", name: "Fashion", description: "Lookbooks and campaign films with an editorial eye." },
  { id: "automotive", name: "Automotive", description: "Launch spots and driving films built on sound and speed." },
  { id: "real-estate", name: "Real Estate", description: "Property films that sell space, light and lifestyle." },
  {
    id: "tours",
    name: "Tours",
    description:
      "Travel agency campaigns, destination reels, and tour operator content — shot on location.",
  },
  { id: "lifestyle", name: "Lifestyle", description: "Quiet, human stories for brands with a point of view." },
  { id: "reels", name: "Reels / Social", description: "Vertical-first edits engineered for the first three seconds." },
  { id: "ai", name: "AI Videos", description: "Generated sequences directed and cut like real productions." },
];

// Counts are derived from the data so they never drift.
export const categories: Category[] = base.map((c) => ({
  ...c,
  count: c.id === "reels" ? reels.length : projects.filter((p) => p.category === c.id).length,
}));

export function getCategory(id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}
