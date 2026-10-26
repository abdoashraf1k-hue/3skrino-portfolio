"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useTransition } from "react";
import BrandFilterBar from "@/components/ui/BrandFilterBar";
import WorkGrid from "@/components/ui/WorkGrid";
import type { Brand } from "@/data/brands";
import type { Category } from "@/data/categories";
import type { Project } from "@/data/projects";
import { CONTAINER } from "@/lib/utils";

type Props = {
  brands: Brand[];
  /** The brand the server filtered by (null = all branded work). */
  activeId: string | null;
  /** ?brand= named a brand that doesn't exist or has nothing to show. */
  unknownId: string | null;
  /** Already filtered on the server. */
  projects: Project[];
  categories: Category[];
};

function Filtered({ brands, activeId, unknownId, projects, categories }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  /** ?brand= changes re-render the server page (the filter lives there); the grid's own ?cat= etc. reset. */
  const go = (brand: string | null) => {
    const next = new URLSearchParams(params.toString());
    for (const k of ["cat", "filmed", "directed", "edited", "orient", "year", "sort"]) next.delete(k);
    if (brand) next.set("brand", brand);
    else next.delete("brand");
    const qs = next.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  return (
    <section data-section="Reels" className="pb-20 md:pb-28">
      <div className={CONTAINER}>
        <BrandFilterBar brands={brands} activeId={activeId} pending={pending} onSelect={go} onClear={() => go(null)} />
        {unknownId && (
          <p role="status" className="mb-8 font-mono text-[10px] uppercase tracking-widest text-muted">
            No work to show for “{unknownId}” yet — showing every brand.
          </p>
        )}
        <div className={pending ? "opacity-50 transition-opacity" : "transition-opacity"}>
          {projects.length ? (
            // Keyed by brand so the grid's filter state starts fresh for each brand.
            <WorkGrid key={activeId ?? "all"} projects={projects} categories={categories} />
          ) : (
            <p className="py-20 text-center font-mono text-[11px] uppercase tracking-widest text-muted">No branded projects yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}

/** /reels: brand chips over the work grid. ?brand=<id> is shareable and drives the server-side filter. */
export default function BrandFilteredReels(props: Props) {
  return (
    <Suspense>
      <Filtered {...props} />
    </Suspense>
  );
}
