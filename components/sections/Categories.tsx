import CategoryCard from "@/components/ui/CategoryCard";
import Reveal from "@/components/ui/Reveal";
import SectionHeader from "@/components/ui/SectionHeader";
import { categories } from "@/data/categories";
import { T } from "@/lib/brand";
import { CONTAINER } from "@/lib/utils";

export default function Categories() {
  return (
    <section id="fields" data-section="Fields" className="py-16 md:py-24">
      <div className={CONTAINER}>
        <SectionHeader
          textKey="home.fields"
          aside={
            <p className="max-w-xs text-base leading-relaxed text-muted">
              <T k="home.fields.blurb" vars={{ n: categories.length }} />
            </p>
          }
        />

        <Reveal stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category, i) => (
            <CategoryCard key={category.id} category={category} index={i} />
          ))}
        </Reveal>
      </div>
    </section>
  );
}
