"use client";

import Marquee from "@/components/ui/Marquee";
import Reveal from "@/components/ui/Reveal";
import { useSectionInfo } from "@/components/ui/SectionContext";
import { tools } from "@/data/site";
import { useSiteConfig } from "@/lib/live-config";
import { CONTAINER, cn } from "@/lib/utils";

/** About: copy + stats come from admin → Content (live in the preview). */
export default function About({ index: indexProp = "" }: { index?: string }) {
  const { content } = useSiteConfig();
  const index = useSectionInfo()?.index ?? indexProp;
  const { stats } = content;

  return (
    <section id="about" data-section="About" className="relative pt-16 md:pt-24">
      <div className={cn(CONTAINER, "grid grid-cols-12 gap-x-6 gap-y-16 pb-20 md:pb-32")}>
        <div className="relative col-span-12 lg:col-span-5">
          {index && (
            <span
              aria-hidden
              className="type-display pointer-events-none absolute -left-[0.04em] -top-[0.35em] z-0 select-none text-[clamp(9rem,24vw,24rem)] leading-none text-fg/[0.05]"
            >
              {index}
            </span>
          )}
          <Reveal stagger className="relative lg:sticky lg:top-32">
            <p className="mb-6 font-mono text-[11px] uppercase tracking-widest text-muted">
              {index && <>({index}) </>}About
            </p>
            <h2 className="type-display text-[clamp(3.25rem,8vw,8rem)] leading-[0.88]">
              <span className="block">9+ Years</span>
              <span className="block">
                of <span className="pr-[0.06em] italic text-accent">cutting.</span>
              </span>
            </h2>
          </Reveal>
        </div>

        <div className="col-span-12 lg:col-span-6 lg:col-start-7">
          <Reveal stagger className="flex max-w-xl flex-col gap-6 text-lg leading-relaxed text-muted">
            {content.aboutParagraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {content.aboutHighlight && <p className="text-fg">{content.aboutHighlight}</p>}
          </Reveal>

          {stats.length > 0 && (
            <Reveal
              stagger
              className="mt-16 grid border-y border-line"
              style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
            >
              {stats.map((stat, i) => (
                <div
                  key={`${stat.label}-${i}`}
                  className={cn("py-8", i < stats.length - 1 && "border-r border-line", i > 0 && "pl-4 md:pl-8")}
                >
                  <p className="type-display text-[clamp(2.5rem,5.5vw,5rem)] leading-none">{stat.value}</p>
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted">{stat.label}</p>
                </div>
              ))}
            </Reveal>
          )}
        </div>
      </div>

      <Marquee
        items={tools}
        speed={45}
        direction="right"
        separator="/"
        separatorClassName="text-muted"
        className="border-t border-line py-6"
        itemClassName="font-mono text-sm uppercase tracking-widest text-muted duration-300 hover:text-fg md:text-base"
      />
    </section>
  );
}
