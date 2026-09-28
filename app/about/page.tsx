import type { Metadata } from "next";
import About from "@/components/sections/About";
import PageHeader from "@/components/ui/PageHeader";
import Reveal from "@/components/ui/Reveal";
import { categories } from "@/data/categories";
import { CONTAINER, pad } from "@/lib/utils";

export const metadata: Metadata = {
  title: "About",
  description: "9+ years of cutting — the story and services behind 3SKRINO.",
};

const services = [
  { title: "Editing", text: "Story-first offline and online edits for film, broadcast and social." },
  { title: "Color", text: "Grading in DaVinci Resolve — from natural to heavily stylised looks." },
  { title: "Motion", text: "Titles, typography and graphics in After Effects." },
  { title: "Content", text: "Concept-to-delivery social content packages, vertical-first." },
  { title: "AI Direction", text: "Generative sequences directed, curated and finished like live action." },
];

const timeline = [
  { year: "2017", text: "First paid edit. Started cutting for local brands and musicians." },
  { year: "2019", text: "Moved into commercials — sports, automotive and real estate." },
  { year: "2022", text: "Went fully independent as a one-man studio." },
  { year: "2024", text: "Crossed 100 clients and 11M+ views on social work." },
  { year: "2026", text: "Directing AI-driven films alongside traditional edits." },
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        label="(About) Studio of one"
        title={
          <>
            Cut with
            <br />
            intent.
          </>
        }
        description="3SKRINO is the one-man studio of a Cairo-based senior video editor and content creator — edit, color, motion and AI under one roof."
        meta="Cairo → Worldwide"
      />

      <About index="01" />

      <section id="services" className="border-b border-line py-20 md:py-32">
        <div className={CONTAINER}>
          <p className="mb-12 font-mono text-[11px] uppercase tracking-widest text-muted">(02) Services</p>
          <Reveal stagger className="border-t border-line">
            {services.map((s, i) => (
              <div
                key={s.title}
                className="grid grid-cols-12 items-baseline gap-6 border-b border-line py-8 md:py-10"
              >
                <span className="col-span-2 font-mono text-[11px] text-muted md:col-span-1">{pad(i + 1)}</span>
                <h3 className="col-span-10 text-3xl font-black uppercase tracking-tight md:col-span-5 md:text-5xl">
                  {s.title}
                </h3>
                <p className="col-span-12 max-w-md text-base leading-relaxed text-muted md:col-span-6">
                  {s.text}
                </p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section id="timeline" className="border-b border-line py-20 md:py-32">
        <div className={CONTAINER}>
          <p className="mb-12 font-mono text-[11px] uppercase tracking-widest text-muted">(03) Timeline</p>
          <Reveal stagger className="grid grid-cols-1 gap-y-10 md:grid-cols-5 md:gap-x-6">
            {timeline.map((t) => (
              <div key={t.year} className="border-t border-line pt-6">
                <p className="text-4xl font-black tracking-tight">{t.year}</p>
                <p className="mt-4 text-base leading-relaxed text-muted">{t.text}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section id="fields" className="py-20 md:py-32">
        <div className={CONTAINER}>
          <p className="mb-12 font-mono text-[11px] uppercase tracking-widest text-muted">(04) Fields</p>
          <Reveal>
            <p className="max-w-5xl text-[clamp(2rem,5vw,4.5rem)] font-black uppercase leading-[1.05] tracking-tight">
              {categories.map((c, i) => (
                <span key={c.id}>
                  {c.name}
                  {i < categories.length - 1 && <span className="text-muted"> / </span>}
                </span>
              ))}
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}
