import About from "@/components/sections/About";
import AIShowcase from "@/components/sections/AIShowcase";
import Categories from "@/components/sections/Categories";
import Contact from "@/components/sections/Contact";
import { HorizontalCuts, VerticalCuts } from "@/components/sections/CutsSection";
import HeroSwitch from "@/components/sections/HeroSwitch";
import HomeLayout from "@/components/sections/HomeLayout";
import RolesMarquee from "@/components/sections/RolesMarquee";

/**
 * The hero (whichever variant admin → Heroes picked), then the sections in the order admin → Layout sets (each can be
 * hidden; numbering follows the order). Sections render on the server and
 * HomeLayout arranges them, so the admin preview can reorder them live.
 */
export default function Home() {
  return (
    <>
      <HeroSwitch />
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
