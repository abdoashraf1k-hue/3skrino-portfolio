import CategoryCard from "@/components/ui/CategoryCard";
import Reveal from "@/components/ui/Reveal";
import SectionHeader from "@/components/ui/SectionHeader";
import { categories } from "@/data/categories";
import { CONTAINER } from "@/lib/utils";

export default function Categories() {
  return (
    <section id="fields" className="border-b border-line py-24 md:py-40">
      <div className={CONTAINER}>
        <SectionHeader
          index="03"
          label="Fields"
          lines={["What I", "Cut."]}
          aside={
            <p className="max-w-xs text-base leading-relaxed text-muted">
              Nine fields, one editorial eye. Mostly vertical, always built around
              rhythm, story and the platform it lives on.
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
