"use client";

import Reveal from "@/components/ui/Reveal";
import { useSectionInfo } from "@/components/ui/SectionContext";
import SocialLinks from "@/components/ui/SocialLinks";
import { parseHeadline, useText } from "@/lib/brand";
import { useSiteConfig } from "@/lib/live-config";
import { CONTAINER, cn } from "@/lib/utils";

export default function Contact() {
  const { content } = useSiteConfig();
  const index = useSectionInfo()?.index;
  const t = useText();
  const HEADLINE = parseHeadline(t("home.contact.headline")).map((l) => (typeof l === "string" ? l : l.text));

  return (
    <section id="contact" data-section="Contact" className="relative flex min-h-[90svh] items-center overflow-hidden py-20 md:py-32">
      {index && (
        <span
          aria-hidden
          className="type-display pointer-events-none absolute right-[4vw] top-[4vh] select-none text-[clamp(9rem,24vw,24rem)] leading-none text-fg/[0.05]"
        >
          {index}
        </span>
      )}
      <div className={cn(CONTAINER, "relative flex flex-col items-center text-center")}>
        <Reveal>
          <p className="mb-10 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted">
            <span className="size-1.5 rounded-full bg-accent" />
            {index && <>({index}) </>}
            {t("home.contact.status")}
          </p>
        </Reveal>
        {/* Letters crystallise in: rise, fade and sharpen from an 8px blur. */}
        <Reveal split each={0.04} y={40} blur={8}>
          <h2 aria-label={HEADLINE.join(" ")} className="type-display text-[clamp(4.5rem,15vw,17rem)] leading-[0.86]">
            {HEADLINE.map((line) => (
              <span key={line} aria-hidden className="block">
                {line.split("").map((char, i) => (
                  <span key={i} data-reveal-split className="inline-block">
                    {char}
                  </span>
                ))}
              </span>
            ))}
          </h2>
        </Reveal>
        <Reveal stagger delay={0.2} className="flex flex-col items-center">
          <a
            href={`mailto:${content.email}`}
            data-magnetic
            className="mt-12 text-[clamp(1.5rem,4.5vw,4rem)] font-medium tracking-normal transition-[color,letter-spacing] duration-400 ease-out hover:tracking-[0.02em] hover:text-accent"
          >
            {content.email}
          </a>
          <SocialLinks className="mt-12 justify-center" />
        </Reveal>
      </div>
    </section>
  );
}
