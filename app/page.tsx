import About from "@/components/sections/About";
import AIShowcase from "@/components/sections/AIShowcase";
import Categories from "@/components/sections/Categories";
import Contact from "@/components/sections/Contact";
import Hero from "@/components/sections/Hero";
import ReelsPreview from "@/components/sections/ReelsPreview";
import SelectedWork from "@/components/sections/SelectedWork";
import Marquee from "@/components/ui/Marquee";
import { roles } from "@/data/site";

export default function Home() {
  return (
    <>
      <Hero />
      <Marquee
        items={roles}
        speed={50}
        breathe
        className="border-y border-line py-6"
        itemClassName="text-3xl uppercase tracking-tight md:text-5xl"
      />
      <SelectedWork />
      <Categories />
      <ReelsPreview />
      <AIShowcase />
      <About />
      <Contact />
    </>
  );
}
