import Marquee from "@/components/ui/Marquee";
import Reveal from "@/components/ui/Reveal";
import { tools } from "@/data/site";
import { CONTAINER, cn } from "@/lib/utils";

const stats = [
  { value: "11M+", label: "Views" },
  { value: "100+", label: "Clients" },
  { value: "9+", label: "Years" },
];

export default function About({ index = "05" }: { index?: string }) {
  return (
    <section id="about" className="border-b border-line pt-24 md:pt-40">
      <div className={cn(CONTAINER, "grid grid-cols-12 gap-x-6 gap-y-16 pb-24 md:pb-40")}>
        <div className="col-span-12 lg:col-span-5">
          <Reveal stagger className="lg:sticky lg:top-32">
            <p className="mb-6 font-mono text-[11px] uppercase tracking-widest text-muted">
              ({index}) About
            </p>
            <h2 className="text-[clamp(3rem,7vw,7rem)] font-black uppercase leading-[0.9] tracking-tight">
              <span className="block">9+ Years</span>
              <span className="block">of cutting.</span>
            </h2>
          </Reveal>
        </div>

        <div className="col-span-12 lg:col-span-6 lg:col-start-7">
          <Reveal stagger className="flex max-w-xl flex-col gap-6 text-lg leading-relaxed text-muted">
            <p>
              I&apos;m a senior video editor and content creator with more than nine years
              behind the timeline — shaping brand films, commercials and social content
              for clients across the Middle East and beyond.
            </p>
            <p>
              My work moves between fields: sports and automotive, fashion and food, real
              estate, corporate storytelling and lifestyle. Different worlds, same
              obsession — rhythm, clarity and the frame that makes people stop scrolling.
            </p>
            <p>
              I run as a one-man studio. Edit, color, motion, sound and delivery under one
              roof, which means fewer handoffs, faster turnarounds and a single point of
              view from first assembly to final export.
            </p>
            <p className="text-fg">
              Lately I&apos;m directing AI-generated sequences too — treating generative
              tools like a new camera department, with the same editorial discipline.
            </p>
          </Reveal>

          <Reveal stagger className="mt-16 grid grid-cols-3 border-y border-line">
            {stats.map((stat, i) => (
              <div
                key={stat.label}
                className={cn("py-8", i < stats.length - 1 && "border-r border-line", i > 0 && "pl-4 md:pl-8")}
              >
                <p className="text-[clamp(2.25rem,5vw,4.5rem)] font-black leading-none tracking-tight">
                  {stat.value}
                </p>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted">
                  {stat.label}
                </p>
              </div>
            ))}
          </Reveal>
        </div>
      </div>

      <Marquee
        items={tools}
        speed={45}
        direction="right"
        separator="/"
        className="border-t border-line py-6"
        itemClassName="font-mono text-sm uppercase tracking-widest text-muted md:text-base"
      />
    </section>
  );
}
