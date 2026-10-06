"use client";

import { useBrandConfig, useHeroConfig, useSiteConfig } from "@/lib/live-config";
import { RICH_MOTION_QUERY, useMediaQuery } from "@/lib/hooks";
import { useText } from "@/lib/brand";
import { CONTAINER, cn } from "@/lib/utils";
import ConfrontationStage from "./ConfrontationStage";
import { HeroCtas } from "./shared";

/**
 * Hero A — "The Confrontation". The portrait stands in the frame and reacts
 * to the visitor as if he can see them. The name sits behind him, set huge;
 * the CTAs and a one-line hint sit at the base. Phones and reduced motion get
 * the configured still (no state machine, no WebGL).
 */
export default function ConfrontationHero() {
  const hero = useHeroConfig();
  const brand = useBrandConfig();
  const { content } = useSiteConfig();
  const t = useText();
  const live = useMediaQuery(RICH_MOTION_QUERY);

  return (
    <section id="home" data-section="Hero" aria-label={brand.identity.name} className="relative isolate flex min-h-svh flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(46% 42% at 50% 46%, color-mix(in srgb, var(--accent) 7%, transparent) 0%, transparent 72%), linear-gradient(180deg, var(--bg) 0%, var(--bg-soft) 100%)",
        }}
      />

      {/* The name, behind him. */}
      <p
        aria-hidden
        className="type-display pointer-events-none absolute inset-x-0 top-[14svh] -z-10 select-none text-center text-[clamp(5rem,22vw,22rem)] leading-[0.8] text-fg/[0.07]"
      >
        {brand.identity.name}
      </p>

      <p className="sr-only">{t("hero.confrontation.srLabel")}</p>

      <div className="relative mx-auto mt-auto w-full max-w-[min(92vw,calc(100svh-4rem))]">
        <ConfrontationStage hero={hero} config={hero.confrontation} live={live} className="w-full" />
      </div>

      <div className={cn(CONTAINER, "absolute inset-x-0 bottom-0 z-10 flex flex-col gap-6 pb-8 md:flex-row md:items-end md:justify-between md:pb-12")}>
        <div className="max-w-md">
          <p className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted">
            <span className="size-1.5 rounded-full bg-accent" />
            {t("hero.confrontation.kicker")}
          </p>
          <h1 className="type-display text-[clamp(2.75rem,6vw,5.5rem)] leading-[0.86]">{brand.identity.name}</h1>
          <p className="mt-3 text-lg leading-snug text-fg/75">{content.tagline.length > 1 ? content.tagline : brand.identity.tagline}</p>
          <HeroCtas className="mt-6" />
        </div>
        {live && <p className="max-w-[16rem] font-mono text-[10px] uppercase leading-relaxed tracking-widest text-muted md:text-right">{t("hero.confrontation.hint")}</p>}
      </div>
    </section>
  );
}
