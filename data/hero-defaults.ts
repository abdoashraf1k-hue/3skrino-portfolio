import type { HeroConfig, HeroFeatures, HeroPose } from "./hero-config";

/**
 * Factory settings for the hero — what "Reset" in the admin goes back to.
 * Kept apart from data/hero-config.ts, which the admin rewrites.
 */

export const DEFAULT_LADDER: HeroPose[] = [
  { id: "very-hard-left", label: "Very hard left", src: "/hero/poses/very-hard-left.webp", tint: "#e7fe55" },
  { id: "hard-left", label: "Hard left", src: "/hero/poses/hard-left.webp", tint: "#d4f73c" },
  { id: "slight-left", label: "Slight left", src: "/hero/poses/slight-left.webp", tint: "#eefb9a" },
  { id: "center", label: "Center", src: "/hero/silhouette-1600.webp", tint: "#ffffff" },
  { id: "slight-right", label: "Slight right", src: "/hero/poses/slight-right.webp", tint: "#ffb27a" },
  { id: "hard-right", label: "Hard right", src: "/hero/poses/hard-right.webp", tint: "#ff6a1f" },
  { id: "very-hard-right", label: "Very hard right", src: "/hero/poses/very-hard-right.webp", tint: "#ff2d2d" },
];

export const DEFAULT_UP: HeroPose = { id: "up", label: "Up", src: "/hero/poses/up.webp", tint: "#e7fe55" };
export const DEFAULT_DOWN: HeroPose = { id: "down", label: "Down", src: "/hero/poses/down.webp", tint: "#ff6a1f" };

/** Every pose by id, for a per-pose "reset to default". */
export const DEFAULT_POSES: Record<string, HeroPose> = Object.fromEntries(
  [...DEFAULT_LADDER, DEFAULT_UP, DEFAULT_DOWN].map((p) => [p.id, p]),
);

export const DEFAULT_FEATURES: HeroFeatures = {
  ambientSound: false,
  cinematicBars: true,
  parallax: 0.6,
  reactiveLighting: true,
  cameraShake: true,
  glitch: true,
  chromaticAberration: 0.5,
  bloom: 0.5,
  autoAlign: true,
  particles: true,
  particleIntensity: 0.5,
  fog: true,
  lightRays: true,
  rayIntensity: 0.5,
  depthOfField: true,
  filter: "none",
  hueShift: true,
  cursorRipple: true,
};

export const DEFAULT_ROLES: HeroConfig["roles"] = {
  items: ["Video Editor", "Director", "Colorist", "Content Creator", "AI Artist", "Visionary", "Storyteller", "Cinematographer"],
  interval: 3,
};

export const DEFAULT_HERO_CONFIG: HeroConfig = {
  poses: { ladder: DEFAULT_LADDER, up: DEFAULT_UP, down: DEFAULT_DOWN },
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
  features: DEFAULT_FEATURES,
  ambientSrc: "",
  roles: DEFAULT_ROLES,
};
