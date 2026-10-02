import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import ContactForm from "@/components/ui/ContactForm";
import PageHeader from "@/components/ui/PageHeader";
import Reveal from "@/components/ui/Reveal";
import SocialLinks from "@/components/ui/SocialLinks";
import { site } from "@/data/site";
import { CONTAINER, cn } from "@/lib/utils";

export const metadata: Metadata = pageMetadata({
  title: "Contact",
  description: "Start a project with 3SKRINO — brand films, commercials, social and AI video.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <>
      <PageHeader
        label={
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-accent" />
            Available for new projects — 2026
          </span>
        }
        title={
          <>
            Let&apos;s
            <br />
            create.
          </>
        }
      />

      <section id="contact" className={cn(CONTAINER, "grid grid-cols-12 gap-x-6 gap-y-16 pb-24 md:pb-40")}>
        <Reveal stagger className="col-span-12 flex flex-col gap-12 lg:col-span-4">
          <div>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted">Email</p>
            <a
              href={`mailto:${site.email}`}
              className="text-2xl font-medium tracking-tight transition-colors duration-300 hover:text-accent md:text-3xl"
            >
              {site.email}
            </a>
          </div>
          <div>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted">Based in</p>
            <p className="text-lg">Cairo, Egypt — working worldwide</p>
          </div>
          <div>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted">Response time</p>
            <p className="text-lg">Within 24 hours</p>
          </div>
          <div>
            <p className="mb-4 font-mono text-[10px] uppercase tracking-widest text-muted">Elsewhere</p>
            <SocialLinks />
          </div>
        </Reveal>

        <Reveal className="col-span-12 lg:col-span-7 lg:col-start-6">
          <ContactForm />
        </Reveal>
      </section>
    </>
  );
}
