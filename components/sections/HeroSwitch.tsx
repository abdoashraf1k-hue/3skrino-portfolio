"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { HERO_VARIANT_PARAM, useHeroVariant } from "@/components/heroes/shared";
import Hero from "@/components/sections/Hero";
import { DEFAULT_ACTIVE_HERO, packHero } from "@/data/hero-pack";
import { useSiteConfig } from "@/lib/live-config";

// The alternates are code-split: a visitor only downloads the hero they see.
const SplitHero = dynamic(() => import("@/components/heroes/SplitHero"));
const GalleryHero = dynamic(() => import("@/components/heroes/GalleryHero"));
const TimelineHero = dynamic(() => import("@/components/heroes/TimelineHero"));
const MirrorHero = dynamic(() => import("@/components/heroes/MirrorHero"));
const ConfrontationHero = dynamic(() => import("@/components/heroes/ConfrontationHero"));
const InterviewHero = dynamic(() => import("@/components/heroes/InterviewHero"));
const Hero3D = dynamic(() => import("@/components/heroes/Hero3D"));
const GenesisHero = dynamic(() => import("@/components/heroes/GenesisHero"));
const PackHeroFrame = dynamic(() => import("@/components/heroes/PackHeroFrame"));

/** ?activeHero=<id|default> forces a pack hero (admin previews); a bare ?heroVariant=… implies "default". */
export const ACTIVE_HERO_PARAM = "activeHero";
function readForcedActive(): string | null {
  const q = new URLSearchParams(window.location.search);
  const v = q.get(ACTIVE_HERO_PARAM);
  if (v === DEFAULT_ACTIVE_HERO || packHero(v)) return v;
  return q.has(HERO_VARIANT_PARAM) ? DEFAULT_ACTIVE_HERO : null;
}
const noop = () => () => {};

/**
 * admin → Heroes → Pack heroes (site-config activeHero): a pack hero in an
 * iframe at every width (each has a desktop and a portrait layout), else
 * ("default") the variant below.
 */
export default function HeroSwitch() {
  const forced = useSyncExternalStore(noop, readForcedActive, () => null);
  const { activeHero } = useSiteConfig();
  const pack = packHero(forced ?? activeHero ?? DEFAULT_ACTIVE_HERO);
  if (pack) return <PackHeroFrame key={pack.id} hero={pack} />;
  return <VariantHero />;
}

/**
 * Renders the hero picked in admin → Heroes (data/site-config.ts →
 * heroVariant). "cinematic" is the original Hero, untouched.
 */
function VariantHero() {
  switch (useHeroVariant()) {
    case "split":
      return <SplitHero />;
    case "gallery":
      return <GalleryHero />;
    case "timeline":
      return <TimelineHero />;
    case "mirror":
      return <MirrorHero />;
    case "confrontation":
      return <ConfrontationHero />;
    case "interview":
      return <InterviewHero />;
    case "model3d":
      return <Hero3D />;
    case "genesis":
      return <GenesisHero />;
    default:
      return <Hero />;
  }
}
