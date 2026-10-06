/**
 * The brand system — edited from /admin (Brand, Categories, Text, Numbers,
 * Icons tabs + Theme → Palettes), which rewrites ONLY the `brandConfig`
 * object literal below. Types and comments are kept verbatim.
 *
 * Runtime: <SiteStyle> turns `scale`, `motion` and `states` into CSS custom
 * properties (--space-*, --step-*, --dur-*, --ease-*, --radius-*, --focus-*),
 * so every component reads the same tokens. Text and numbers are overrides
 * on top of data/text-registry.ts / data/number-registry.ts defaults.
 */

export type BrandPalette = {
  id: string;
  name: string;
  bg: string;
  bgSoft: string;
  fg: string;
  accent: string;
  accent2: string;
  /** Per-category colour in this palette (category id → #hex). */
  categoryColors: Record<string, string>;
};

export type CategoryDef = {
  /** The slug projects reference (data/projects.ts → category). */
  id: string;
  name: string;
  description: string;
  /** Default signature colour; a palette / Theme override wins. */
  color: string;
  /** Glyph or emoji shown on chips and the admin. */
  emoji: string;
  enabled: boolean;
};

export type IconSource = "lucide" | "heroicons" | "upload" | "glyph";

export type BrandIcon = {
  /** Referenced as "icon:<id>" from roles, categories and anywhere an icon is picked. */
  id: string;
  name: string;
  source: IconSource;
  /** An https SVG URL (lucide / heroicons / upload) or the glyph itself. */
  value: string;
};

export type SignatureMoments = {
  /** Page transition: a clapperboard slate (scene · take) wipes across. */
  slateWipe: boolean;
  /** Primary CTAs lean toward the cursor like a focus pull. */
  magneticCtas: boolean;
  /** A running SMPTE timecode in the corner, driven by scroll. */
  scrollTimecode: boolean;
  /** First visit: a 3-2-1 film-leader countdown (once per session). */
  leaderCountdown: boolean;
  /** Keyboard focus as a rack-focus ring: blur → sharp accent outline. */
  rackFocus: boolean;
};

export type BrandConfig = {
  identity: {
    name: string;
    tagline: string;
    mission: string;
    /** Logo variations (a /path or https URL; empty → the type-set wordmark). */
    logos: { primary: string; mark: string; mono: string };
  };
  voice: {
    summary: string;
    traits: string[];
    do: string[];
    dont: string[];
  };
  scale: {
    /** Base spacing unit in px (2–12); --space-N = unit × steps[N]. */
    unit: number;
    steps: number[];
    /** Body size in px (12–22) and the modular ratio (1.1–1.618) → --step--2 … --step-6. */
    typeBase: number;
    typeRatio: number;
    radius: { sm: number; md: number; lg: number };
    grid: { columns: number; gutter: number; maxWidth: number };
  };
  motion: {
    /** Durations in ms. */
    fast: number;
    base: number;
    slow: number;
    cinematic: number;
    /** CSS easings: cubic-bezier(…) or a keyword. */
    ease: string;
    easeInOut: string;
    principles: string[];
  };
  /** One interaction language for hover / active / focus everywhere. */
  states: {
    /** Hover lift in px (0–8). */
    hoverLift: number;
    /** Active press scale (0.9–1). */
    pressScale: number;
    /** Focus ring width in px (1–4) and offset (0–6). */
    focusWidth: number;
    focusOffset: number;
  };
  palettes: { active: string; items: BrandPalette[] };
  principles: { iconography: string; imagery: string };
  signature: SignatureMoments;
  categories: CategoryDef[];
  /** Text overrides: registry key → text. Missing keys use data/text-registry.ts. */
  text: Record<string, string>;
  /** Number overrides: registry key → value. Missing keys use data/number-registry.ts. */
  numbers: Record<string, number>;
  icons: BrandIcon[];
};

export const brandConfig: BrandConfig = {
  identity: {
    name: "3SKRINO",
    tagline: "Cut to the feeling.",
    mission: "Make brands feel like films: rhythm first, story always, every frame earning its place.",
    logos: { primary: "", mark: "", mono: "" },
  },
  voice: {
    summary: "An editor talking shop: short sentences, cinema vocabulary, confident without shouting.",
    traits: ["Direct", "Cinematic", "Warm under the edge", "Allergic to filler"],
    do: [
      "Use film language: cut, frame, rhythm, take, grade",
      "Say what happens next — 'Watch the reel', not 'Learn more'",
      "Keep it to one idea per line",
    ],
    dont: ["Hype words: revolutionary, world-class, cutting-edge", "Exclamation marks", "Apologising in errors"],
  },
  scale: {
    unit: 4,
    steps: [0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32],
    typeBase: 16,
    typeRatio: 1.25,
    radius: { sm: 2, md: 6, lg: 14 },
    grid: { columns: 12, gutter: 24, maxWidth: 1600 },
  },
  motion: {
    fast: 160,
    base: 320,
    slow: 700,
    cinematic: 1200,
    ease: "cubic-bezier(0.22, 1, 0.36, 1)",
    easeInOut: "cubic-bezier(0.65, 0, 0.35, 1)",
    principles: [
      "Motion answers the visitor — a cut happens because someone asked for it",
      "One hero moment per screen; everything else holds still",
      "Ease out like a dolly settling, never bounce",
    ],
  },
  states: { hoverLift: 2, pressScale: 0.97, focusWidth: 2, focusOffset: 3 },
  palettes: {
    active: "violet-hour",
    items: [
      {
        id: "violet-hour",
        name: "Violet hour",
        bg: "#08060c",
        bgSoft: "#120e19",
        fg: "#f2eefb",
        accent: "#b69cff",
        accent2: "#ff3df0",
        categoryColors: {
          sports: "#3dd9ff",
          corporate: "#8fa3ff",
          restaurants: "#ff8a3d",
          fashion: "#ff5ec4",
          automotive: "#ff2d2d",
          "real-estate": "#3dffb0",
          tours: "#ffd23d",
          lifestyle: "#c9a3ff",
          reels: "#e7fe55",
          ai: "#9b8cff",
          furniture: "#d9a066",
        },
      },
      {
        id: "tungsten",
        name: "Tungsten",
        bg: "#0c0907",
        bgSoft: "#18120d",
        fg: "#f6efe6",
        accent: "#ffb547",
        accent2: "#ff4d2e",
        categoryColors: {},
      },
      {
        id: "lime-slate",
        name: "Lime slate",
        bg: "#0a0a0a",
        bgSoft: "#141414",
        fg: "#f5f5f5",
        accent: "#e7fe55",
        accent2: "#ff2d2d",
        categoryColors: {},
      },
    ],
  },
  principles: {
    iconography: "Thin-stroke line icons (1.5px) or single typographic glyphs. Never filled, never coloured except the accent on hover.",
    imagery: "Backlit, high-contrast, grain kept. Faces in silhouette, light from behind, colour from the rim.",
  },
  signature: { slateWipe: true, magneticCtas: true, scrollTimecode: true, leaderCountdown: false, rackFocus: true },
  categories: [
    { id: "sports", name: "Sports", description: "Campaigns, match-day edits and athlete stories cut for energy.", color: "#3dd9ff", emoji: "⚡", enabled: true },
    {
      id: "corporate",
      name: "Corporate",
      description: "Brand films and documentaries that make companies feel human.",
      color: "#8fa3ff",
      emoji: "◼",
      enabled: true,
    },
    { id: "restaurants", name: "Restaurants", description: "Food films with texture, heat and appetite.", color: "#ff8a3d", emoji: "🔥", enabled: true },
    { id: "fashion", name: "Fashion", description: "Lookbooks and campaign films with an editorial eye.", color: "#ff5ec4", emoji: "✦", enabled: true },
    {
      id: "automotive",
      name: "Automotive",
      description: "Launch spots and driving films built on sound and speed.",
      color: "#ff2d2d",
      emoji: "◢",
      enabled: true,
    },
    {
      id: "real-estate",
      name: "Real Estate",
      description: "Property films that sell space, light and lifestyle.",
      color: "#3dffb0",
      emoji: "▣",
      enabled: true,
    },
    {
      id: "tours",
      name: "Tours",
      description: "Travel agency campaigns, destination reels, and tour operator content — shot on location.",
      color: "#ffd23d",
      emoji: "◎",
      enabled: true,
    },
    { id: "lifestyle", name: "Lifestyle", description: "Quiet, human stories for brands with a point of view.", color: "#c9a3ff", emoji: "◐", enabled: true },
    {
      id: "furniture",
      name: "Furniture",
      description: "Showroom films and product stories where material, light and craft carry the cut.",
      color: "#d9a066",
      emoji: "▤",
      enabled: true,
    },
    { id: "reels", name: "Reels / Social", description: "Vertical-first edits engineered for the first three seconds.", color: "#e7fe55", emoji: "▮", enabled: true },
    { id: "ai", name: "AI Videos", description: "Generated sequences directed and cut like real productions.", color: "#9b8cff", emoji: "◆", enabled: true },
  ],
  text: {},
  numbers: {},
  icons: [
    { id: "film", name: "Film", source: "lucide", value: "https://unpkg.com/lucide-static@0.469.0/icons/film.svg" },
    { id: "clapperboard", name: "Clapperboard", source: "lucide", value: "https://unpkg.com/lucide-static@0.469.0/icons/clapperboard.svg" },
    { id: "scissors", name: "Scissors", source: "lucide", value: "https://unpkg.com/lucide-static@0.469.0/icons/scissors.svg" },
    { id: "spark", name: "Spark", source: "glyph", value: "✦" },
  ],
};
