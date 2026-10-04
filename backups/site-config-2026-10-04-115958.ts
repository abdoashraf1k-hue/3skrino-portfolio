/**
 * Site-wide settings — edited from /admin (Theme, Layout, Content, SEO,
 * Backups tabs), which rewrites ONLY the `siteConfig` object literal below.
 * Types, constants and comments are kept verbatim.
 */

/** Home sections that can be reordered / hidden. The hero always comes first. */
export type SectionId = "marquee" | "vertical" | "horizontal" | "fields" | "ai" | "about" | "contact";

/**
 * Bento presets: mosaic — the varied 2×2 / tall / wide rhythm; editorial —
 * fewer, bigger tiles; uniform — an even grid of equal tiles.
 */
export type BentoPattern = "mosaic" | "editorial" | "uniform";

export type HomeSection = { id: SectionId; visible: boolean; pattern: BentoPattern };

export type DisplayFont = "anton" | "archivo-black" | "bebas-neue" | "oswald" | "inter";

export type SiteTheme = {
  bg: string;
  bgSoft: string;
  fg: string;
  accent: string;
  accent2: string;
  /** Display letter-spacing in em (-0.06 … 0.1). */
  letterSpacing: number;
  /** Card / tile corner radius in px (0 … 24). */
  radius: number;
  /** Film grain opacity (0 … 0.15). */
  grain: number;
  /** Screen-edge vignette (0 … 1). */
  vignette: number;
  /** Big headlines. */
  displayFont: DisplayFont;
  /** Small bold text: card titles, section labels. */
  labelFont: DisplayFont;
  /** Signature colour per category id. */
  categoryColors: Record<string, string>;
};

export type SiteContent = {
  siteTitle: string;
  siteDescription: string;
  /** The line under the hero name. */
  tagline: string;
  email: string;
  location: string;
  role: string;
  aboutParagraphs: string[];
  /** The last About paragraph, set brighter. */
  aboutHighlight: string;
  stats: { value: string; label: string }[];
  socials: { label: string; href: string }[];
  /** Uploaded share image (1200×630). Empty → the generated one. */
  ogImage: string;
  /** Uploaded favicon (square PNG). Empty → the generated one. */
  favicon: string;
};

export type ProjectSeo = { title?: string; description?: string };

export type BackupSchedule = "off" | "daily" | "weekly" | "monthly";

/* ------------------------------------------------------------------ */
/* Sprint 10 — hero variants + the cinematic toolbox                   */
/* ------------------------------------------------------------------ */

/** Which hero the home page opens with (admin → Heroes). */
export type HeroVariant = "cinematic" | "split" | "gallery" | "timeline" | "mirror";

/** Colour-grade presets applied to the site's images and videos. */
export type LutPreset = "none" | "teal-orange" | "bleach" | "kodak" | "noir" | "warm" | "cool" | "vintage";

export type AspectRatio = "2.39:1" | "16:9" | "4:3" | "1:1";

export type CinematicEffects = {
  /** intensity 0–1 · flicker = grain redraws per second (1–24) · dust 0–1. */
  filmGrain: { enabled: boolean; intensity: number; flicker: number; dust: number };
  /** strength 0–1; breathing slowly pulses it. */
  chromatic: { enabled: boolean; strength: number; breathing: boolean };
  /** All 0–1. */
  vhs: { enabled: boolean; scanlines: number; tracking: number; bleeding: number };
  /** All 0–1. */
  crt: { enabled: boolean; curve: number; glow: number; trails: number };
  /** intensity 0–1 · duration in seconds (0.3–2). */
  filmBurn: { enabled: boolean; intensity: number; duration: number };
  lightLeaks: { enabled: boolean; ambient: boolean; hover: boolean };
  /** strength 0–1 · frequency 0–1 (rare → often) · blockSize in px (4–80). */
  glitch: { enabled: boolean; strength: number; frequency: number; blockSize: number };
  /** height in % of the viewport (2–16) · opacity 0–1. */
  bars: { enabled: boolean; height: number; opacity: number; hideOnScroll: boolean };
  lut: { enabled: boolean; preset: LutPreset };
  /** intensity 0–1 · threshold = scroll speed (px/frame, 10–120) that triggers a shake. */
  cameraShake: { enabled: boolean; intensity: number; threshold: number };
  /** intensity = max blur in px (0–12). */
  depthOfField: { enabled: boolean; intensity: number; mode: "center" | "cursor" };
  /** 0–1. */
  motionBlur: { enabled: boolean; strength: number };
  /** 0–1. */
  halation: { enabled: boolean; strength: number };
  /** intensity 0–1 · threshold 0–1 (how bright a pixel must be to glow). */
  bloom: { enabled: boolean; intensity: number; threshold: number };
  letterbox: { enabled: boolean; ratio: AspectRatio };
  /** 0–1. */
  timeRemap: { enabled: boolean; strength: number };
  shutterFlash: { enabled: boolean };
  /** 0–1. */
  filmScratch: { enabled: boolean; density: number };
};

export type EffectId = keyof CinematicEffects;

/** Where an effect runs: everywhere, only over the hero, only past it, or only in the listed home sections. */
export type EffectScope = "global" | "hero" | "sections" | "specific";
export type ScopeRule = { scope: EffectScope; sections: SectionId[] };

export type CursorSize = "sm" | "md" | "lg";
export type CursorStyle = "dot" | "ring" | "crosshair" | "playhead" | "aperture";

export type SoundName = "hover" | "click" | "transition" | "notification" | "error" | "success";
/** src: empty → a synthesised sound; else an uploaded mp3 / wav. volume 0–100. */
export type SoundSlot = { enabled: boolean; volume: number; src: string };

export type EntryAnimation = "fade" | "slide" | "scale" | "blur";

/** Per-section overrides (admin → Sections). Missing keys follow the global settings. */
export type SectionFx = {
  entry?: EntryAnimation;
  letterbox?: AspectRatio;
  lut?: LutPreset;
  crt?: boolean;
  /** Chromatic aberration strength (0–1) just for this section. */
  chromatic?: number;
  /** Depth-of-field blur (px) while this section is centred. */
  dof?: number;
};

export type CinematicConfig = {
  effects: CinematicEffects;
  /** Missing → the effect's default scope (see EFFECT_DEFAULT_SCOPE). */
  scopes: Partial<Record<EffectId, ScopeRule>>;
  /** Per-project colour grade (project id → preset), on top of the global LUT. */
  lutProjects: Record<string, LutPreset>;
  sections: Partial<Record<SectionId, SectionFx>>;
  cursor: {
    size: CursorSize;
    style: CursorStyle;
    /** "accent", "white" or a #hex. */
    color: string;
    /** length = trail dots (2–24). */
    trail: { enabled: boolean; length: number };
    /** scale 1–3 · color "accent" / "white" / #hex. */
    hover: { scale: number; color: string; glow: boolean };
  };
  sound: {
    enabled: boolean;
    /** Master 0–100. */
    volume: number;
    sounds: Record<SoundName, SoundSlot>;
  };
  motion: {
    /** Global speed multiplier, 0.5–2. */
    speed: number;
    entry: EntryAnimation;
    /** Hover transition duration in ms (80–1200). */
    hover: number;
    /** A CSS easing: cubic-bezier(…) or a keyword. */
    easing: string;
  };
  experiments: {
    vhs: boolean;
    crt: boolean;
    filmBurn: boolean;
    letterbox: boolean;
    timeRemap: boolean;
    shutterFlash: boolean;
    filmScratch: boolean;
  };
  /** Options for the alternate heroes. */
  heroOptions: {
    /** Project id whose video plays in the Split hero. Empty → the first featured vertical project with footage. */
    splitReel: string;
    /** Tiles on the Gallery wall (12–36). */
    galleryCount: number;
    /** Mirror panels (5–7). */
    mirrorCount: number;
    /** Timeline hero plays on its own until the pointer takes over. */
    timelineAutoplay: boolean;
  };
};

export type SiteConfig = {
  theme: SiteTheme;
  layout: { sections: HomeSection[] };
  content: SiteContent;
  seo: { projects: Record<string, ProjectSeo> };
  backups: { schedule: BackupSchedule };
  heroVariant: HeroVariant;
  cinematic: CinematicConfig;
};

export const SECTION_LABELS: Record<SectionId, string> = {
  marquee: "Roles marquee",
  vertical: "Vertical Cuts",
  horizontal: "Horizontal Cuts",
  fields: "Fields",
  ai: "AI Cuts",
  about: "About",
  contact: "Contact",
};

export const siteConfig: SiteConfig = {
  theme: {
    bg: "#08060c",
    bgSoft: "#120e19",
    fg: "#f2eefb",
    accent: "#b69cff",
    accent2: "#ff3df0",
    letterSpacing: 0.02,
    radius: 2,
    grain: 0.03,
    vignette: 0.35,
    displayFont: "anton",
    labelFont: "archivo-black",
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
    },
  },
  layout: {
    sections: [
      { id: "marquee", visible: true, pattern: "mosaic" },
      { id: "vertical", visible: true, pattern: "mosaic" },
      { id: "horizontal", visible: true, pattern: "mosaic" },
      { id: "fields", visible: true, pattern: "mosaic" },
      { id: "ai", visible: true, pattern: "mosaic" },
      { id: "about", visible: true, pattern: "mosaic" },
      { id: "contact", visible: true, pattern: "mosaic" },
    ],
  },
  content: {
    siteTitle: "3SKRINO — Video Editor & Content Creator",
    siteDescription: "3SKRINO is a Cairo-based senior video editor and content creator with 9+ years cutting brand films, commercials, social reels and AI-driven visuals.",
    tagline: ".",
    email: "abdoashraf@gmail.com",
    location: "Cairo",
    role: "Senior Video Editor & Content Creator",
    aboutParagraphs: [
      "I'm a senior video editor and content creator with more than nine years behind the timeline — shaping brand films, commercials and social content for clients across the Middle East and beyond.",
      "My work moves between fields: sports and automotive, fashion and food, real estate, corporate storytelling and lifestyle. Different worlds, same obsession — rhythm, clarity and the frame that makes people stop scrolling.",
      "I run as a one-man studio. Edit, color, motion, sound and delivery under one roof, which means fewer handoffs, faster turnarounds and a single point of view from first assembly to final export.",
    ],
    aboutHighlight: "Lately I'm directing AI-generated sequences too — treating generative tools like a new camera department, with the same editorial discipline.",
    stats: [
      { value: "3M+", label: "Views" },
      { value: "100+", label: "Clients" },
      { value: "9+", label: "Years" },
    ],
    socials: [{ label: "Instagram", href: "https://instagram.com/3skrino" }],
    ogImage: "",
    favicon: "",
  },
  seo: { projects: {} },
  backups: { schedule: "weekly" },
  heroVariant: "split",
  cinematic: {
    effects: {
      filmGrain: { enabled: false, intensity: 0.08, flicker: 12, dust: 0.3 },
      chromatic: { enabled: false, strength: 0.35, breathing: true },
      vhs: { enabled: false, scanlines: 0.5, tracking: 0.4, bleeding: 0.3 },
      crt: { enabled: false, curve: 0.5, glow: 0.4, trails: 0.3 },
      filmBurn: { enabled: false, intensity: 0.7, duration: 0.9 },
      lightLeaks: { enabled: false, ambient: true, hover: true },
      glitch: { enabled: false, strength: 0.4, frequency: 0.25, blockSize: 24 },
      bars: { enabled: false, height: 8, opacity: 1, hideOnScroll: true },
      lut: { enabled: false, preset: "none" },
      cameraShake: { enabled: false, intensity: 0.4, threshold: 60 },
      depthOfField: { enabled: false, intensity: 4, mode: "center" },
      motionBlur: { enabled: false, strength: 0.4 },
      halation: { enabled: false, strength: 0.4 },
      bloom: { enabled: false, intensity: 0.4, threshold: 0.7 },
      letterbox: { enabled: false, ratio: "2.39:1" },
      timeRemap: { enabled: false, strength: 0.4 },
      shutterFlash: { enabled: false },
      filmScratch: { enabled: false, density: 0.4 },
    },
    scopes: {},
    lutProjects: {},
    sections: {},
    cursor: {
      size: "md",
      style: "dot",
      color: "accent",
      trail: { enabled: false, length: 8 },
      hover: { scale: 1, color: "accent", glow: false },
    },
    sound: {
      enabled: false,
      volume: 70,
      sounds: {
        hover: { enabled: true, volume: 35, src: "" },
        click: { enabled: true, volume: 60, src: "" },
        transition: { enabled: true, volume: 60, src: "" },
        notification: { enabled: true, volume: 60, src: "" },
        error: { enabled: true, volume: 60, src: "" },
        success: { enabled: true, volume: 60, src: "" },
      },
    },
    motion: { speed: 1, entry: "slide", hover: 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    experiments: {
      vhs: false,
      crt: false,
      filmBurn: false,
      letterbox: false,
      timeRemap: false,
      shutterFlash: false,
      filmScratch: false,
    },
    heroOptions: { splitReel: "", galleryCount: 30, mirrorCount: 7, timelineAutoplay: true },
  },
};
