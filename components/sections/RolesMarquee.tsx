"use client";

import Marquee from "@/components/ui/Marquee";
import { useHeroConfig } from "@/lib/live-config";

/** The roles strip under the hero — the same list the nav and mid-screen cyclers use (admin → Roles). */
export default function RolesMarquee() {
  const { roles } = useHeroConfig();
  return (
    <Marquee
      items={roles.items}
      speed={70}
      separator="✦"
      separatorClassName="text-[0.6em] text-accent"
      alternateItalic
      className="border-y border-line py-6"
      itemClassName="type-display pr-[0.06em] text-3xl text-fg/60 duration-150 hover:italic hover:text-accent md:text-5xl"
    />
  );
}
