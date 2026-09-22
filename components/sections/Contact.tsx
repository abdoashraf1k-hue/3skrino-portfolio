import Reveal from "@/components/ui/Reveal";
import SocialLinks from "@/components/ui/SocialLinks";
import { site } from "@/data/site";
import { CONTAINER, cn } from "@/lib/utils";

export default function Contact() {
  return (
    <section id="contact" className="flex min-h-[90svh] items-center py-24 md:py-40">
      <Reveal stagger className={cn(CONTAINER, "flex flex-col items-center text-center")}>
        <p className="mb-10 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted">
          <span className="size-1.5 rounded-full bg-accent" />
          (06) Available for new projects
        </p>
        <h2 className="text-[clamp(4rem,12vw,14rem)] font-black uppercase leading-[0.88] tracking-tight">
          <span className="block">Let&apos;s</span>
          <span className="block">Create.</span>
        </h2>
        <a
          href={`mailto:${site.email}`}
          className="mt-12 text-[clamp(1.5rem,4.5vw,4rem)] font-medium tracking-tight transition-colors duration-300 hover:text-accent"
        >
          {site.email}
        </a>
        <SocialLinks className="mt-12 justify-center" />
      </Reveal>
    </section>
  );
}
