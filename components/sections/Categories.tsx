import Link from "next/link";
import Reveal from "@/components/ui/Reveal";
import SectionHeader from "@/components/ui/SectionHeader";
import { categories } from "@/data/categories";
import { CONTAINER, pad } from "@/lib/utils";

export default function Categories() {
  return (
    <section id="fields" className="border-b border-line py-24 md:py-40">
      <div className={CONTAINER}>
        <SectionHeader
          index="02"
          label="Fields"
          lines={["What I", "Cut."]}
          aside={
            <p className="max-w-xs text-base leading-relaxed text-muted">
              Nine fields, one editorial eye. Every cut is built around rhythm,
              story and the platform it lives on.
            </p>
          }
        />

        <Reveal stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category, i) => (
            <Link
              key={category.id}
              href={`/work/${category.id}`}
              data-hover
              className="group flex min-h-[240px] flex-col justify-between border border-line p-8 transition-colors duration-500 hover:border-accent hover:bg-accent/5"
            >
              <span className="font-mono text-[11px] text-muted">{pad(i + 1)}</span>
              <h3 className="my-10 text-[clamp(2rem,3vw,2.5rem)] font-black uppercase leading-none tracking-tight">
                {category.name}
              </h3>
              <span className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted">
                {category.count} {category.count === 1 ? "Project" : "Projects"}
                <span className="text-sm transition-all duration-300 group-hover:translate-x-1 group-hover:text-accent">
                  →
                </span>
              </span>
            </Link>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
