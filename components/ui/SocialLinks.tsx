import { socials } from "@/data/site";
import { cn } from "@/lib/utils";

export default function SocialLinks({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <ul
      className={cn(
        "flex flex-wrap font-mono uppercase tracking-widest",
        compact ? "gap-6 text-[10px]" : "gap-x-8 gap-y-3 text-[11px]",
        className,
      )}
    >
      {socials.map((s) => (
        <li key={s.label}>
          <a
            href={s.href}
            target="_blank"
            rel="noreferrer"
            className="text-muted transition-colors duration-300 hover:text-accent"
          >
            {s.label}
            {!compact && <span className="ml-1">↗</span>}
          </a>
        </li>
      ))}
    </ul>
  );
}
