import type { Metadata } from "next";
import BrandFilteredReels from "@/components/ui/BrandFilteredReels";
import PageHeader from "@/components/ui/PageHeader";
import { brands, brandsWithProjects, getBrand, projectsForBrand } from "@/data/brands";
import { categories } from "@/data/categories";
import { projects } from "@/data/projects";
import { pageMetadata } from "@/lib/seo";

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

/** ?brand=<id> → that brand, when it exists and has work to show. */
async function activeBrand(searchParams: Props["searchParams"]) {
  const raw = (await searchParams).brand;
  const id = Array.isArray(raw) ? raw[0] : raw;
  const brand = id ? getBrand(id) : undefined;
  return { requested: id ?? "", brand: brand && brand.projectIds.length > 0 ? brand : undefined };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { brand } = await activeBrand(searchParams);
  return brand
    ? pageMetadata({
        title: `${brand.name} — Reels`,
        description: `Every cut 3SKRINO made for ${brand.name}.`,
        path: `/reels?brand=${encodeURIComponent(brand.id)}`,
      })
    : pageMetadata({ title: "Reels by brand", description: "Client work by 3SKRINO, filtered by brand.", path: "/reels" });
}

/**
 * Sprint 13 — the brand ecosystem's landing page. Clicking a hero logo opens
 * /reels?brand=<id>; the filter runs here on the server, and the client
 * component only handles switching / clearing it (which updates the URL).
 */
export default async function ReelsPage({ searchParams }: Props) {
  const { requested, brand } = await activeBrand(searchParams);
  const branded = projects.filter((p) => p.brandId && brands.some((b) => b.id === p.brandId));
  const shown = brand ? projectsForBrand(brand.id) : branded;

  return (
    <>
      <PageHeader
        label="(04) Brands"
        title={
          brand ? (
            brand.name
          ) : (
            <>
              By <span className="italic text-accent">Brand</span>
            </>
          )
        }
        description={
          brand
            ? `Every cut made for ${brand.name} — vertical, horizontal and AI.`
            : "Pick a brand to see the work made for it. Logos in the hero open the same filter."
        }
        meta={`${shown.length} project${shown.length === 1 ? "" : "s"} · ${brandsWithProjects.length} brand${brandsWithProjects.length === 1 ? "" : "s"}`}
      />
      <BrandFilteredReels
        brands={brandsWithProjects}
        activeId={brand?.id ?? null}
        unknownId={requested && !brand ? requested : null}
        projects={shown}
        categories={categories}
      />
    </>
  );
}
