import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import ProjectGrid from "@/components/ui/ProjectGrid";
import ReelCard from "@/components/ui/ReelCard";
import Reveal from "@/components/ui/Reveal";
import { categories, getCategory } from "@/data/categories";
import { getProjectsByCategory, reels } from "@/data/projects";
import { CONTAINER, cn, pad } from "@/lib/utils";

export const dynamicParams = false;

export function generateStaticParams() {
  return categories.map((c) => ({ category: c.id }));
}

export async function generateMetadata(props: PageProps<"/work/[category]">): Promise<Metadata> {
  const { category } = await props.params;
  const data = getCategory(category);
  return data ? { title: data.name, description: data.description } : {};
}

export default async function CategoryPage(props: PageProps<"/work/[category]">) {
  const { category: id } = await props.params;
  const category = getCategory(id);
  if (!category) notFound();

  const items = getProjectsByCategory(category.id);
  const index = categories.findIndex((c) => c.id === category.id);
  const isReels = category.id === "reels";

  return (
    <>
      <PageHeader
        label={
          <Link href="/work" className="transition-colors duration-300 hover:text-accent">
            ← Work / {pad(index + 1)}
          </Link>
        }
        title={category.name}
        description={category.description}
        meta={`${category.count} ${category.count === 1 ? "project" : "projects"}`}
      />

      <section id="projects" className={cn(CONTAINER, "pb-24 md:pb-40")}>
        {isReels ? (
          <Reveal stagger className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {reels.map((reel, i) => (
              <ReelCard key={reel.id} reel={reel} index={i} />
            ))}
          </Reveal>
        ) : items.length > 0 ? (
          <ProjectGrid projects={items} />
        ) : (
          <div className="flex flex-col items-start gap-6 border-y border-line py-24">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
              New work in the edit bay
            </p>
            <p className="text-3xl font-black uppercase tracking-tight md:text-5xl">Coming soon.</p>
            <Link
              href="/work"
              className="font-mono text-[11px] uppercase tracking-widest text-muted transition-colors duration-300 hover:text-accent"
            >
              ← Back to all work
            </Link>
          </div>
        )}
      </section>

      <nav aria-label="Other fields" className="border-t border-line">
        <ul className={cn(CONTAINER, "flex flex-wrap gap-x-8 gap-y-3 py-10 font-mono text-[11px] uppercase tracking-widest")}>
          {categories
            .filter((c) => c.id !== category.id)
            .map((c) => (
              <li key={c.id}>
                <Link href={`/work/${c.id}`} className="text-muted transition-colors duration-300 hover:text-accent">
                  {c.name}
                </Link>
              </li>
            ))}
        </ul>
      </nav>
    </>
  );
}
