import Image from "next/image";
import { cn } from "@/lib/utils";

type PlaceholderProps = {
  title: string;
  /** Used to vary the gradient so cards don't look identical. */
  seed?: number;
  image?: string;
  className?: string;
  size?: "sm" | "lg";
};

const GRADIENTS = [
  "radial-gradient(120% 90% at 20% 10%, #262626 0%, #141414 45%, #0b0b0b 100%)",
  "radial-gradient(110% 100% at 85% 20%, #232323 0%, #121212 50%, #0a0a0a 100%)",
  "radial-gradient(120% 120% at 50% 100%, #242424 0%, #131313 45%, #0a0a0a 100%)",
  "linear-gradient(135deg, #1e1e1e 0%, #111111 55%, #0a0a0a 100%)",
  "radial-gradient(100% 90% at 10% 90%, #252525 0%, #121212 50%, #0b0b0b 100%)",
];

/**
 * Dark gradient stand-in for footage. Swap to a real still by passing `image`.
 */
export default function Placeholder({ title, seed = 0, image, className, size = "lg" }: PlaceholderProps) {
  return (
    <div
      className={cn("absolute inset-0 overflow-hidden", className)}
      style={{ background: GRADIENTS[seed % GRADIENTS.length] }}
    >
      {image ? (
        <Image src={image} alt={title} fill sizes="(min-width: 1024px) 60vw, 100vw" className="object-cover" />
      ) : (
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 flex items-center justify-center px-6 text-center font-black uppercase leading-none tracking-tight text-fg/[0.05]",
            size === "lg" ? "text-[clamp(2.5rem,7vw,7rem)]" : "text-4xl",
          )}
        >
          {title}
        </span>
      )}
    </div>
  );
}
