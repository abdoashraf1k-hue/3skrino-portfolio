/**
 * Hero settings — edited from /admin?tab=hero, which rewrites ONLY the
 * `heroConfig` object literal below (types and comments are kept verbatim).
 */

export type HeroPose = {
  id: string;
  label: string;
  /** Local path (/hero/...) or an https URL (Vercel Blob). Square, transparent, same framing as the others. */
  src: string;
  /** Rim-light tint this pose pulls toward (reactive lighting). */
  tint: string;
};

export type BrandLogo = {
  id: string;
  name: string;
  imageUrl: string;
  /** Kept for reference only — clicks never navigate. */
  href?: string;
  /** Rendered size in px (40–80). */
  size?: number;
  visible: boolean;
};

export type HeroFeatures = {
  ambientSound: boolean;
  cinematicBars: boolean;
  /** 0–1: how far the back layers drift with the pointer. */
  parallax: number;
  reactiveLighting: boolean;
  cameraShake: boolean;
  glitch: boolean;
  /** 0–1 (0 = off; 0.5 = the original look). */
  chromaticAberration: number;
  /** 0–1 (0.5 = the original look). */
  bloom: number;
};

export type HeroConfig = {
  poses: {
    /** Left → right. The middle entry is the resting (centre) pose. Always 7. */
    ladder: HeroPose[];
    up: HeroPose;
    down: HeroPose;
  };
  logos: { enabled: boolean; items: BrandLogo[] };
  features: HeroFeatures;
  /** Ambient loop: empty → a synthesised WebAudio drone; else a file such as /audio/hero-ambient.mp3. */
  ambientSrc: string;
  /** The nav's cycling descriptor. */
  roles: { items: string[]; interval: number };
};

export const LADDER_SIZE = 7;

export const heroConfig: HeroConfig = {
  poses: {
    ladder: [
      {
        id: "very-hard-left",
        label: "Very hard left",
        src: "/hero/poses/very-hard-left.webp",
        tint: "#e7fe55",
      },
      { id: "hard-left", label: "Hard left", src: "/hero/poses/hard-left.webp", tint: "#d4f73c" },
      { id: "slight-left", label: "Slight left", src: "/hero/poses/slight-left.webp", tint: "#eefb9a" },
      { id: "center", label: "Center", src: "/hero/silhouette-1600.webp", tint: "#ffffff" },
      { id: "slight-right", label: "Slight right", src: "/hero/poses/slight-right.webp", tint: "#ffb27a" },
      { id: "hard-right", label: "Hard right", src: "/hero/poses/hard-right.webp", tint: "#ff6a1f" },
      {
        id: "very-hard-right",
        label: "Very hard right",
        src: "/hero/poses/very-hard-right.webp",
        tint: "#ff2d2d",
      },
    ],
    up: { id: "up", label: "Up", src: "/hero/poses/up.webp", tint: "#e7fe55" },
    down: { id: "down", label: "Down", src: "/hero/poses/down.webp", tint: "#ff6a1f" },
  },
  logos: {
    enabled: true,
    items: [
      { id: "northwind", name: "Northwind", imageUrl: "/brands/northwind.svg", size: 64, visible: true },
      { id: "halcyon", name: "Halcyon", imageUrl: "/brands/halcyon.svg", size: 52, visible: true },
      { id: "vantablack", name: "Vantablack", imageUrl: "/brands/vantablack.svg", size: 72, visible: true },
      { id: "orbitra", name: "Orbitra", imageUrl: "/brands/orbitra.svg", size: 48, visible: true },
      { id: "kinetic", name: "Kinetic", imageUrl: "/brands/kinetic.svg", size: 60, visible: true },
      { id: "solace", name: "Solace", imageUrl: "/brands/solace.svg", size: 56, visible: true },
      { id: "monolith", name: "Monolith", imageUrl: "/brands/monolith.svg", size: 68, visible: true },
      { id: "prism", name: "Prism", imageUrl: "/brands/prism.svg", size: 44, visible: true },
    ],
  },
  features: {
    ambientSound: false,
    cinematicBars: true,
    parallax: 0.6,
    reactiveLighting: true,
    cameraShake: true,
    glitch: true,
    chromaticAberration: 0.5,
    bloom: 0.5,
  },
  ambientSrc: "",
  roles: {
    items: [
      "Video Editor",
      "Director",
      "Colorist",
      "Content Creator",
      "AI Artist",
      "Visionary",
      "Storyteller",
      "Cinematographer",
    ],
    interval: 3,
  },
};
