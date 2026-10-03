import { getCategory } from "@/data/categories";
import { projectHref, projects } from "@/data/projects";
import { site } from "@/data/site";
import { absoluteUrl, SITE_URL } from "@/lib/seo";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

function pubDate(p: (typeof projects)[number]): Date {
  return p.createdAt ? new Date(p.createdAt) : new Date(Date.UTC(p.year, 0, 1));
}

export const dynamic = "force-static";

/** RSS 2.0 — the latest 20 projects. Built statically; rebuilt on every deploy. */
export function GET() {
  const items = [...projects]
    .sort((a, b) => pubDate(b).getTime() - pubDate(a).getTime())
    .slice(0, 20)
    .map((p) => {
      const url = absoluteUrl(projectHref(p));
      const description = p.description || `${p.title} — ${p.role} for ${p.client}.`;
      return `    <item>
      <title>${esc(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${esc(description)}</description>
      <category>${esc(getCategory(p.category)?.name ?? p.category)}</category>
      <pubDate>${pubDate(p).toUTCString()}</pubDate>${p.thumbnail ? `\n      <enclosure url="${esc(p.thumbnail)}" type="image/jpeg" length="0" />` : ""}
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(site.name)} — Work</title>
    <link>${SITE_URL}</link>
    <description>${esc(`New vertical, horizontal and AI cuts from ${site.name}, ${site.role}.`)}</description>
    <language>en</language>
    <atom:link href="${absoluteUrl("/feed.xml")}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
