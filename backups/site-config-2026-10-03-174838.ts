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

export type SiteConfig = {
  theme: SiteTheme;
  layout: { sections: HomeSection[] };
  content: SiteContent;
  seo: { projects: Record<string, ProjectSeo> };
  backups: { schedule: BackupSchedule };
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
    bg: "#0a0a0a",
    bgSoft: "#141414",
    fg: "#f5f5f5",
    accent: "#e7fe55",
    accent2: "#ff2d2d",
    letterSpacing: -0.01,
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
    email: "hello@3skrino.com",
    location: "Cairo",
    role: "Senior Video Editor & Content Creator",
    aboutParagraphs: [
      "I'm a senior video editor and content creator with more than nine years behind the timeline — shaping brand films, commercials and social content for clients across the Middle East and beyond.",
      "My work moves between fields: sports and automotive, fashion and food, real estate, corporate storytelling and lifestyle. Different worlds, same obsession — rhythm, clarity and the frame that makes people stop scrolling.",
      "I run as a one-man studio. Edit, color, motion, sound and delivery under one roof, which means fewer handoffs, faster turnarounds and a single point of view from first assembly to final export.",
    ],
    aboutHighlight: "Lately I'm directing AI-generated sequences too — treating generative tools like a new camera department, with the same editorial discipline.",
    stats: [
      { value: "11M+", label: "Views" },
      { value: "100+", label: "Clients" },
      { value: "9+", label: "Years" },
    ],
    socials: [
      { label: "Instagram", href: "https://instagram.com/" },
      { label: "Vimeo", href: "https://vimeo.com/" },
      { label: "Behance", href: "https://behance.net/" },
      { label: "YouTube", href: "https://youtube.com/" },
      { label: "TikTok", href: "https://tiktok.com/" },
      { label: "X", href: "https://x.com/" },
    ],
    ogImage: "",
    favicon: "",
  },
  seo: { projects: {} },
  backups: { schedule: "weekly" },
};
