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
  /** Manual nudge in UV units (x, y), added on top of auto-alignment. */
  offset?: [number, number];
  /** Free-form labels ("smile", "talking"…) the poses manager filters by. */
  tags?: string[];
};

export type BrandLogo = {
  id: string;
  name: string;
  imageUrl: string;
  /** Kept for reference only — clicks never navigate. */
  href?: string;
  /** Rendered size in px (20–600). */
  size?: number;
  visible: boolean;
  /** Manual placement, % of the stage (0–100). Missing → the automatic two-arc slot. */
  x?: number;
  y?: number;
  /** Rotation in degrees (-180…180). */
  angle?: number;
  /** -1 (far) … 1 (near): parallax depth and opacity. Missing → a stable scatter. */
  depth?: number;
};

/** Every state the Confrontation hero can be in. */
export type ConfrontState = "idle" | "eyeContact" | "smile" | "surprise" | "turnAway" | "scoff";

export type ConfrontationConfig = {
  behaviors: {
    /** Head follows the pointer across the pose ladder. */
    tracking: boolean;
    eyeContact: boolean;
    smile: boolean;
    surprise: boolean;
    turnAway: boolean;
    scoff: boolean;
    breathing: boolean;
    /** A glossy highlight inside the lenses that slides toward the cursor. */
    eyeGlint: boolean;
    /** A tiny synthesised gasp on click (needs the site's sound switched on). */
    gaspSound: boolean;
    /** Typographic overlays (sparkle, "!", "ha") composited over the expression poses. */
    overlays: boolean;
  };
  /** Pose id per state (+ the still shown on phones / reduced motion) — any ladder, up / down or expression pose. */
  poses: Record<ConfrontState | "static", string>;
  sensitivity: {
    /** 0–1: how strongly the pointer swings the head. */
    tracking: number;
    /** Seconds of stillness on the silhouette before the smile. */
    smileAfter: number;
    /** Milliseconds the surprise holds. */
    surpriseHold: number;
    /** Seconds away from the silhouette before he turns away. */
    turnAwayAfter: number;
    /** Scale while you hold his gaze (1–1.2). */
    eyeContactZoom: number;
    /** 0–1. */
    glint: number;
    /** 0–1. */
    breathing: number;
  };
  /** Lens centres as image fractions (x right, y down) + radius, for the glint. */
  lenses: { left: [number, number]; right: [number, number]; radius: number };
};

export type InterviewQuestion = {
  id: string;
  question: string;
  /** 2–3 sentences, read aloud and subtitled. */
  answer: string;
  /** Words that route a typed question here (fuzzy). */
  keywords: string[];
  /** Shown as a one-click chip. */
  preset: boolean;
};

export type InterviewConfig = {
  /** The show's name on the TV's lower third. */
  title: string;
  /** Channel number in the TV corner (1–99). */
  channel: number;
  intro: string;
  outro: string;
  /** Answers before "Thank you for watching" (1–12). */
  maxQuestions: number;
  /** When nothing matches a typed question. */
  fallback: string;
  questions: InterviewQuestion[];
  poses: { waiting: string; talking: string; emphasis: string; pensive: string; thanks: string };
  tts: {
    enabled: boolean;
    /** SpeechSynthesis voice name; empty → the browser's default for the page language. */
    voice: string;
    /** 0.5–2. */
    rate: number;
    /** 0–2. */
    pitch: number;
    /** 0–1. */
    volume: number;
  };
  crt: boolean;
  subtitles: boolean;
  waveform: boolean;
};

/** Per-role look, keyed by the role's text. */
export type RoleStyle = {
  /** A glyph ("✦") or an icon id from admin → Icons ("icon:film"). */
  icon: string;
  /** Font weight 100–900. */
  weight: number;
  /** #hex, or "" for the theme colour. */
  color: string;
};

/** Whole-hero colour grade. */
export type HeroFilter = "none" | "warm" | "cool" | "vintage" | "contrast";

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
  /** Snap every pose's shoulders onto the centre pose's (image-difference anchor search). */
  autoAlign: boolean;
  /** Dust / embers rising around the silhouette. */
  particles: boolean;
  /** 0–1: count + brightness. */
  particleIntensity: number;
  /** Coloured fog in front of the silhouette, drifting with the pointer. */
  fog: boolean;
  /** God-rays from the sun. */
  lightRays: boolean;
  /** 0–1. */
  rayIntensity: number;
  /** Background layers soften while the pointer rests near the centre. */
  depthOfField: boolean;
  filter: HeroFilter;
  /** The scene's hue drifts as the hero scrolls away. */
  hueShift: boolean;
  /** A soft ripple from the cursor after 3s without movement. */
  cursorRipple: boolean;
};

export type HeroConfig = {
  poses: {
    /** Left → right. The middle entry is the resting (centre) pose. Always 7. */
    ladder: HeroPose[];
    up: HeroPose;
    down: HeroPose;
  };
  /** Sprint 11: expression poses derived from the ladder (scripts/generate-poses.mjs) or uploaded. */
  expressions: HeroPose[];
  /** scale multiplies every logo's size (0.25–4). */
  logos: { enabled: boolean; scale: number; items: BrandLogo[] };
  features: HeroFeatures;
  /** Ambient loop: empty → a synthesised WebAudio drone; else a file such as /audio/hero-ambient.mp3. */
  ambientSrc: string;
  /** The nav's cycling descriptor. */
  roles: { items: string[]; interval: number; styles: Record<string, RoleStyle> };
  confrontation: ConfrontationConfig;
  interview: InterviewConfig;
};

export const LADDER_SIZE = 7;
/** Brand logo size bounds in px (the slider stops at `slider`; typed values reach `max`). */
export const LOGO_SIZE = { min: 20, slider: 500, max: 600 } as const;

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
  expressions: [
    {
      id: "smile",
      label: "Smile",
      src: "/hero/poses/smile.webp",
      tint: "#ffd9a8",
      tags: ["smile", "warm", "confrontation", "frontal"],
    },
    { id: "laugh", label: "Laugh", src: "/hero/poses/laugh.webp", tint: "#ffc46b", tags: ["laugh", "warm"] },
    {
      id: "surprise",
      label: "Surprise",
      src: "/hero/poses/surprise.webp",
      tint: "#bfe4ff",
      tags: ["surprise", "confrontation", "frontal"],
    },
    { id: "anger", label: "Anger", src: "/hero/poses/anger.webp", tint: "#ff3b2b", tags: ["anger"] },
    {
      id: "side-eye",
      label: "Side-eye",
      src: "/hero/poses/side-eye.webp",
      tint: "#d8d0ff",
      tags: ["side-eye", "scoff", "confrontation"],
    },
    {
      id: "talking",
      label: "Talking",
      src: "/hero/poses/talking.webp",
      tint: "#ffffff",
      tags: ["talking", "interview", "frontal"],
    },
    {
      id: "emphasis",
      label: "Emphasis",
      src: "/hero/poses/emphasis.webp",
      tint: "#fff2c2",
      tags: ["emphasis", "interview"],
    },
    {
      id: "pensive",
      label: "Pensive",
      src: "/hero/poses/pensive.webp",
      tint: "#a9c4ff",
      tags: ["pensive", "interview"],
    },
  ],
  logos: {
    enabled: true,
    scale: 1,
    items: [
      {
        id: "northwind",
        name: "Northwind",
        imageUrl: "https://ugluqj98dbjzamqi.public.blob.vercel-storage.com/brands/northwind-musp1gt2.png",
        size: 80,
        visible: true,
      },
      { id: "halcyon", name: "Halcyon", imageUrl: "/brands/halcyon.svg", size: 52, visible: true },
      {
        id: "vantablack",
        name: "ONE WORLD TOURS",
        imageUrl: "/brands/vantablack.svg",
        href: "https://framerusercontent.com/images/tTDni0LQ1FgBcERWyEXFY4GjjY.png?scale-down-to=512&width=1000&height=1000",
        size: 80,
        visible: true,
      },
      { id: "orbitra", name: "Orbitra", imageUrl: "/brands/orbitra.svg", size: 48, visible: true },
      { id: "kinetic", name: "Kinetic", imageUrl: "/brands/kinetic.svg", size: 60, visible: true },
      { id: "solace", name: "Solace", imageUrl: "/brands/solace.svg", size: 56, visible: true },
      { id: "monolith", name: "Monolith", imageUrl: "/brands/monolith.svg", size: 68, visible: true },
      { id: "prism", name: "Prism", imageUrl: "/brands/prism.svg", size: 44, visible: true },
    ],
  },
  features: {
    ambientSound: false,
    cinematicBars: false,
    parallax: 0.8,
    reactiveLighting: true,
    cameraShake: true,
    glitch: true,
    chromaticAberration: 0.35,
    bloom: 0.5,
    autoAlign: true,
    particles: true,
    particleIntensity: 0.45,
    fog: true,
    lightRays: true,
    rayIntensity: 0.15,
    depthOfField: true,
    filter: "none",
    hueShift: true,
    cursorRipple: true,
  },
  ambientSrc: "",
  roles: {
    items: [
      "Director",
      "Video Editor",
      "Colorist",
      "Content Creator",
      "Cinematographer",
      "AI Artist",
      "Visionary",
      "Storyteller",
    ],
    interval: 1.5,
    styles: {},
  },
  confrontation: {
    behaviors: {
      tracking: true,
      eyeContact: true,
      smile: true,
      surprise: true,
      turnAway: true,
      scoff: true,
      breathing: true,
      eyeGlint: true,
      gaspSound: false,
      overlays: true,
    },
    poses: {
      idle: "center",
      eyeContact: "center",
      smile: "smile",
      surprise: "surprise",
      turnAway: "very-hard-right",
      scoff: "side-eye",
      static: "smile",
    },
    sensitivity: {
      tracking: 0.7,
      smileAfter: 3,
      surpriseHold: 200,
      turnAwayAfter: 10,
      eyeContactZoom: 1.05,
      glint: 0.7,
      breathing: 0.5,
    },
    lenses: { left: [0.376, 0.449], right: [0.615, 0.449], radius: 0.075 },
  },
  interview: {
    title: "The Final Cut",
    channel: 3,
    intro: "Pick a question, or type your own. Three answers, then we cut to black.",
    outro: "Thank you for watching. The rest is in the reel.",
    maxQuestions: 3,
    fallback: "Good question — and not one I can answer in a sentence. Write to me and I'll give it the long version.",
    questions: [
      {
        id: "who",
        question: "Who are you?",
        answer: "I'm 3SKRINO — a video editor and content creator from Cairo. Nine years on the timeline, cutting brand films, commercials and the reels you stop scrolling for.",
        keywords: ["who", "you", "name", "about", "yourself"],
        preset: true,
      },
      {
        id: "what",
        question: "What do you actually do?",
        answer: "Edit, colour, motion and sound — under one roof. You hand me the footage, I hand back a film that has rhythm. No hand-offs, one point of view.",
        keywords: ["do", "services", "work", "job", "edit", "color", "colour"],
        preset: true,
      },
      {
        id: "style",
        question: "How would you describe your style?",
        answer: "Fast where it should hit, patient where it should land. I cut to the music and the breath, not the timeline ruler.",
        keywords: ["style", "look", "aesthetic", "signature", "taste"],
        preset: true,
      },
      {
        id: "ai",
        question: "What about AI video?",
        answer: "I treat generative tools like a new camera department. The machine makes shots; the edit still decides which ones deserve to exist.",
        keywords: ["ai", "generative", "runway", "sora", "kling", "midjourney", "artificial"],
        preset: true,
      },
      {
        id: "clients",
        question: "Who have you worked with?",
        answer: "Sports clubs, car launches, fashion labels, restaurants, developers and tour operators — across the Middle East and beyond. Different worlds, same obsession with the first three seconds.",
        keywords: ["clients", "brands", "worked", "portfolio", "companies"],
        preset: true,
      },
      {
        id: "process",
        question: "What's your process?",
        answer: "I watch everything once without touching it. Then I build the spine, find the music, and cut until nothing can come out without the film falling apart.",
        keywords: ["process", "workflow", "how", "approach", "method"],
        preset: true,
      },
      {
        id: "time",
        question: "How fast can you turn a project around?",
        answer: "A social reel in a day or two, a brand film in about a week. Being a one-man studio means nobody waits on anybody.",
        keywords: ["fast", "time", "turnaround", "deadline", "long", "quick"],
        preset: true,
      },
      {
        id: "hire",
        question: "How do I hire you?",
        answer: "Send me the brief and a deadline from the contact page. I answer within a day — usually with questions that make the brief better.",
        keywords: ["hire", "contact", "book", "price", "cost", "rate", "email", "work together"],
        preset: true,
      },
    ],
    poses: {
      waiting: "center",
      talking: "talking",
      emphasis: "emphasis",
      pensive: "pensive",
      thanks: "smile",
    },
    tts: { enabled: true, voice: "", rate: 1, pitch: 0.9, volume: 0.9 },
    crt: true,
    subtitles: true,
    waveform: true,
  },
};
