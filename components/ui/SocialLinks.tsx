"use client";

import { useSiteConfig } from "@/lib/live-config";
import { cn } from "@/lib/utils";

export default function SocialLinks({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  // Live: admin → Content edits show in the preview before saving.
  const { socials } = useSiteConfig().content;
  return (
    <ul
      className={cn(
        "flex flex-wrap font-mono uppercase tracking-widest",
        compact ? "gap-6 text-[10px]" : "gap-x-8 gap-y-3 text-[11px]",
        className,
      )}
    >
      {socials.map((s) => (
        <li key={`${s.label}-${s.href}`}>
          <a
            href={s.href}
            target="_blank"
            rel="noreferrer"
            className="group text-muted transition-colors duration-300 hover:text-accent"
          >
            {s.label}
            {!compact && (
              <span className="ml-1 inline-block transition-transform duration-300 group-hover:translate-x-0.5">↗</span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
