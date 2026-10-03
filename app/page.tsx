import About from "@/components/sections/About";
import AIShowcase from "@/components/sections/AIShowcase";
import Categories from "@/components/sections/Categories";
import Contact from "@/components/sections/Contact";
import { HorizontalCuts, VerticalCuts } from "@/components/sections/CutsSection";
import Hero from "@/components/sections/Hero";
import HomeLayout from "@/components/sections/HomeLayout";
import RolesMarquee from "@/components/sections/RolesMarquee";

/**
 * The hero, then the sections in the order admin → Layout sets (each can be
 * hidden; numbering follows the order). Sections render on the server and
 * HomeLayout arranges them, so the admin preview can reorder them live.
 */
export default function Home() {
  return (
    <>
      <Hero />
      <HomeLayout
        sections={{
          marquee: <RolesMarquee />,
          vertical: <VerticalCuts />,
          horizontal: <HorizontalCuts />,
          fields: <Categories />,
          ai: <AIShowcase />,
          about: <About />,
          contact: <Contact />,
        }}
      />
    </>
  );
}
