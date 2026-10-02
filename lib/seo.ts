import type { Metadata } from "next";
import { projectHref, type Project } from "@/data/projects";
import { site, socials } from "@/data/site";

/** Canonical origin. Set NEXT_PUBLIC_SITE_URL per environment; falls back to production. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://3skrino.com").replace(/\/+$/, "");

export const absoluteUrl = (path = "/") => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

/**
 * Serialises JSON-LD for a <script> tag. `<` is escaped so a string containing
 * "</script>" can never close the tag early.
 */
export function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function personSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: site.name,
    jobTitle: site.role,
    url: SITE_URL,
    email: `mailto:${site.email}`,
    address: { "@type": "PostalAddress", addressLocality: site.location, addressCountry: "EG" },
    sameAs: socials.map((s) => s.href),
  };
}

/** "01:30" / "01:02:03" → ISO 8601 duration "PT1M30S". */
export function isoDuration(duration: string): string {
  const parts = duration.split(":").map(Number);
  const [h, m, s] = parts.length === 3 ? parts : [0, parts[0] ?? 0, parts[1] ?? 0];
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s || (!h && !m) ? `${s}S` : ""}`;
}

export function videoSchema(project: Project): Record<string, unknown> {
  const url = absoluteUrl(projectHref(project));
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: project.title,
    description: project.description || `${project.title} — ${project.role} for ${project.client}.`,
    thumbnailUrl: [project.thumbnail || absoluteUrl("/opengraph-image")],
    uploadDate: project.createdAt ?? `${project.year}-01-01`,
    duration: isoDuration(project.duration),
    ...(project.videoUrl ? { contentUrl: project.videoUrl } : {}),
    embedUrl: url,
    url,
    keywords: [...(project.tags ?? []), ...project.tools].join(", "),
    creator: { "@type": "Person", name: site.name, url: SITE_URL },
  };
}

/**
 * Title + description + canonical + Open Graph/Twitter for a route. The
 * og:image comes from app/opengraph-image.tsx (file convention), so it isn't
 * repeated here.
 */
export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${title} — ${site.name}`, description, url: path, siteName: site.name, type: "website" },
    twitter: { card: "summary_large_image", title: `${title} — ${site.name}`, description },
  };
}
