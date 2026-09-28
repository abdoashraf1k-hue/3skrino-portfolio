import About from "@/components/sections/About";
import AIShowcase from "@/components/sections/AIShowcase";
import Categories from "@/components/sections/Categories";
import Contact from "@/components/sections/Contact";
import Hero from "@/components/sections/Hero";
import SelectedWork from "@/components/sections/SelectedWork";
import Marquee from "@/components/ui/Marquee";
import { roles } from "@/data/site";

export default function Home() {
  return (
    <>
      <Hero />
      <Marquee
        items={roles.map((role) => role.label)}
        speed={70}
        separator="✦"
        separatorClassName="text-[0.6em] text-accent"
        alternateItalic
        className="border-y border-line py-6"
        itemClassName="pr-[0.06em] text-2xl font-medium uppercase tracking-tight text-fg/60 duration-150 hover:italic hover:text-accent md:text-3xl"
      />
      <SelectedWork />
      <Categories />
      <AIShowcase />
      <About />
      <Contact />
    </>
  );
}
