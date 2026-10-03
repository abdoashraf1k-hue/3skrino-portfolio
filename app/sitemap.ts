import type { MetadataRoute } from "next";
import { categories } from "@/data/categories";
import { projectHref, projects } from "@/data/projects";
import { absoluteUrl } from "@/lib/seo";

/** Every public route. Project lastModified comes from createdAt when known, else the year. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const page = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]) => ({
    url: absoluteUrl(path),
    lastModified: now,
    changeFrequency,
    priority,
  });

  return [
    page("/", 1, "weekly"),
    page("/vertical-cuts", 0.9, "weekly"),
    page("/horizontal-cuts", 0.9, "weekly"),
    page("/ai-cuts", 0.9, "weekly"),
    ...categories.map((c) => page(`/work/${c.id}`, 0.8, "weekly")),
    ...projects.map((p) => ({
      url: absoluteUrl(projectHref(p)),
      lastModified: p.createdAt ? new Date(p.createdAt) : new Date(`${p.year}-12-31`),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    page("/search", 0.3, "monthly"),
    page("/about", 0.4, "yearly"),
    page("/contact", 0.4, "yearly"),
  ];
}
