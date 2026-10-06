import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import BentoReels from "@/components/ui/BentoReels";
import PageHeader from "@/components/ui/PageHeader";
import ProjectGrid from "@/components/ui/ProjectGrid";
import { categories, getCategory } from "@/data/categories";
import { getProjectsByCategory, reels } from "@/data/projects";
import { pageMetadata } from "@/lib/seo";
import { CONTAINER, cn, pad } from "@/lib/utils";

export const dynamicParams = false;

export function generateStaticParams() {
  return categories.map((c) => ({ category: c.id }));
}

export async function generateMetadata(props: PageProps<"/work/[category]">): Promise<Metadata> {
  const { category } = await props.params;
  const data = getCategory(category);
  return data ? pageMetadata({ title: data.name, description: data.description, path: `/work/${data.id}` }) : {};
}

/** The whole page takes the category's signature colour as its accent (admin → Theme). */
const tint = { "--accent": "var(--cat)", "--accent-ink": "var(--cat)" } as CSSProperties;

export default async function CategoryPage(props: PageProps<"/work/[category]">) {
  const { category: id } = await props.params;
  const category = getCategory(id);
  // Disabled in admin → Categories: the page goes away with it.
  if (!category?.enabled) notFound();

  const items = getProjectsByCategory(category.id);
  const index = categories.findIndex((c) => c.id === category.id);
  const isReels = category.id === "reels";

  return (
    <div data-cat={category.id} style={tint}>
      <PageHeader
        label={
          <Link href="/#fields" className="transition-colors duration-300 hover:text-accent">
            ← Fields / {pad(index + 1)}
          </Link>
        }
        title={
          <span className="inline-flex items-start gap-[0.12em]">
            {category.name}
            <span aria-hidden className="mt-[0.12em] size-[0.14em] shrink-0 rounded-full bg-accent" />
          </span>
        }
        description={category.description}
        meta={`${category.count} ${category.count === 1 ? "project" : "projects"}`}
      />

      <section id="projects" data-section={category.name} className={cn(CONTAINER, "pb-24 md:pb-40")}>
        {isReels ? (
          <BentoReels reels={reels} />
        ) : items.length > 0 ? (
          <ProjectGrid projects={items} />
        ) : (
          <div className="flex flex-col items-start gap-6 border-y border-line py-24">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted">New work in the edit bay</p>
            <p className="type-display text-4xl md:text-6xl">Coming soon.</p>
            <Link
              href="/"
              className="font-mono text-[11px] uppercase tracking-widest text-muted transition-colors duration-300 hover:text-accent"
            >
              ← Back home
            </Link>
          </div>
        )}
      </section>

      <nav aria-label="Other fields" className="border-t border-line">
        <ul className={cn(CONTAINER, "flex flex-wrap gap-x-8 gap-y-3 py-10 font-mono text-[11px] uppercase tracking-widest")}>
          {categories
            .filter((c) => c.id !== category.id)
            .map((c) => (
              <li key={c.id} data-cat={c.id}>
                <Link href={`/work/${c.id}`} className="group flex items-center gap-2 text-muted transition-colors duration-300 hover:text-cat">
                  <span aria-hidden className="size-1.5 rounded-full bg-cat opacity-50 transition-opacity group-hover:opacity-100" />
                  {c.name}
                </Link>
              </li>
            ))}
        </ul>
      </nav>
    </div>
  );
}
