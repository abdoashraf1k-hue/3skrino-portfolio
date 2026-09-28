import Reveal from "@/components/ui/Reveal";
import SocialLinks from "@/components/ui/SocialLinks";
import { site } from "@/data/site";
import { CONTAINER, cn } from "@/lib/utils";

const HEADLINE = ["Let's", "Create."];

export default function Contact() {
  return (
    <section id="contact" className="flex min-h-[90svh] items-center py-20 md:py-32">
      <div className={cn(CONTAINER, "flex flex-col items-center text-center")}>
        <Reveal>
          <p className="mb-10 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted">
            <span className="size-1.5 rounded-full bg-accent" />
            (07) Available for new projects
          </p>
        </Reveal>
        {/* Letters crystallise in: rise, fade and sharpen from an 8px blur. */}
        <Reveal split each={0.04} y={40} blur={8}>
          <h2
            aria-label={HEADLINE.join(" ")}
            className="text-[clamp(4rem,12vw,14rem)] font-black uppercase leading-[0.88] tracking-tight"
          >
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
            href={`mailto:${site.email}`}
            className="mt-12 text-[clamp(1.5rem,4.5vw,4rem)] font-medium tracking-normal transition-[color,letter-spacing] duration-400 ease-out hover:tracking-[0.02em] hover:text-accent"
          >
            {site.email}
          </a>
          <SocialLinks className="mt-12 justify-center" />
        </Reveal>
      </div>
    </section>
  );
}
