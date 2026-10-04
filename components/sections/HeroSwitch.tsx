"use client";

import dynamic from "next/dynamic";
import { useHeroVariant } from "@/components/heroes/shared";
import Hero from "@/components/sections/Hero";

// The alternates are code-split: a visitor only downloads the hero they see.
const SplitHero = dynamic(() => import("@/components/heroes/SplitHero"));
const GalleryHero = dynamic(() => import("@/components/heroes/GalleryHero"));
const TimelineHero = dynamic(() => import("@/components/heroes/TimelineHero"));
const MirrorHero = dynamic(() => import("@/components/heroes/MirrorHero"));

/**
 * Renders the hero picked in admin → Heroes (data/site-config.ts →
 * heroVariant). "cinematic" is the original Hero, untouched.
 */
export default function HeroSwitch() {
  switch (useHeroVariant()) {
    case "split":
      return <SplitHero />;
    case "gallery":
      return <GalleryHero />;
    case "timeline":
      return <TimelineHero />;
    case "mirror":
      return <MirrorHero />;
    default:
      return <Hero />;
  }
}
