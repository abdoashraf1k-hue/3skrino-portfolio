"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SocialLinks from "@/components/ui/SocialLinks";
import { site } from "@/data/site";
import { useText } from "@/lib/brand";
import { CONTAINER, cn } from "@/lib/utils";

const YEAR = new Date().getFullYear();

export default function Footer() {
  const pathname = usePathname();
  const t = useText();
  // Home and /contact already end on a full contact section — skip the repeat.
  const showCta = pathname !== "/" && pathname !== "/contact";

  return (
    <footer className="border-t border-line">
      <div className={cn(CONTAINER, "pb-10", showCta ? "pt-24 md:pt-32" : "pt-10")}>
        {showCta && (
          <div className="mb-24 md:mb-32">
            <p className="mb-6 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted">
              <span className="size-1.5 rounded-full bg-accent" />
              {t("global.footer.status")}
            </p>
            <Link
              href="/contact"
              className="type-display block text-[clamp(3.5rem,11vw,11rem)] leading-[0.86] transition-colors duration-300 hover:text-accent"
            >
              {t("global.footer.cta")}
            </Link>
            <a
              href={`mailto:${site.email}`}
              className="mt-8 inline-block text-2xl font-medium tracking-tight text-muted transition-colors duration-300 hover:text-accent md:text-4xl"
            >
              {site.email}
            </a>
            <SocialLinks className="mt-12" />
          </div>
        )}

        <div className="flex flex-col justify-between gap-3 font-mono text-[10px] uppercase tracking-widest text-muted sm:flex-row">
          <span>
            © {YEAR} {site.name} <span className="text-muted/70">— {t("global.footer.place")}</span>
          </span>
          {!showCta && <SocialLinks className="hidden lg:flex" compact />}
          <span>{t("global.footer.reach")}</span>
        </div>
      </div>
    </footer>
  );
}
