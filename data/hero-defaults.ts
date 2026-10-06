import type { ConfrontationConfig, HeroConfig, HeroFeatures, HeroPose, InterviewConfig } from "./hero-config";

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

/** Sprint 11 — derived from the ladder by scripts/generate-poses.mjs (warps of the user's own photos). */
export const DEFAULT_EXPRESSIONS: HeroPose[] = [
  { id: "smile", label: "Smile", src: "/hero/poses/smile.webp", tint: "#ffd9a8", tags: ["smile", "warm", "confrontation", "frontal"] },
  { id: "laugh", label: "Laugh", src: "/hero/poses/laugh.webp", tint: "#ffc46b", tags: ["laugh", "warm"] },
  { id: "surprise", label: "Surprise", src: "/hero/poses/surprise.webp", tint: "#bfe4ff", tags: ["surprise", "confrontation", "frontal"] },
  { id: "anger", label: "Anger", src: "/hero/poses/anger.webp", tint: "#ff3b2b", tags: ["anger"] },
  { id: "side-eye", label: "Side-eye", src: "/hero/poses/side-eye.webp", tint: "#d8d0ff", tags: ["side-eye", "scoff", "confrontation"] },
  { id: "talking", label: "Talking", src: "/hero/poses/talking.webp", tint: "#ffffff", tags: ["talking", "interview", "frontal"] },
  { id: "emphasis", label: "Emphasis", src: "/hero/poses/emphasis.webp", tint: "#fff2c2", tags: ["emphasis", "interview"] },
  { id: "pensive", label: "Pensive", src: "/hero/poses/pensive.webp", tint: "#a9c4ff", tags: ["pensive", "interview"] },
];

/** Every pose by id, for a per-pose "reset to default". */
export const DEFAULT_POSES: Record<string, HeroPose> = Object.fromEntries(
  [...DEFAULT_LADDER, DEFAULT_UP, DEFAULT_DOWN, ...DEFAULT_EXPRESSIONS].map((p) => [p.id, p]),
);

export const DEFAULT_CONFRONTATION: ConfrontationConfig = {
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
};

export const DEFAULT_INTERVIEW: InterviewConfig = {
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
      answer:
        "I'm 3SKRINO — a video editor and content creator from Cairo. Nine years on the timeline, cutting brand films, commercials and the reels you stop scrolling for.",
      keywords: ["who", "you", "name", "about", "yourself"],
      preset: true,
    },
    {
      id: "what",
      question: "What do you actually do?",
      answer:
        "Edit, colour, motion and sound — under one roof. You hand me the footage, I hand back a film that has rhythm. No hand-offs, one point of view.",
      keywords: ["do", "services", "work", "job", "edit", "color", "colour"],
      preset: true,
    },
    {
      id: "style",
      question: "How would you describe your style?",
      answer:
        "Fast where it should hit, patient where it should land. I cut to the music and the breath, not the timeline ruler.",
      keywords: ["style", "look", "aesthetic", "signature", "taste"],
      preset: true,
    },
    {
      id: "ai",
      question: "What about AI video?",
      answer:
        "I treat generative tools like a new camera department. The machine makes shots; the edit still decides which ones deserve to exist.",
      keywords: ["ai", "generative", "runway", "sora", "kling", "midjourney", "artificial"],
      preset: true,
    },
    {
      id: "clients",
      question: "Who have you worked with?",
      answer:
        "Sports clubs, car launches, fashion labels, restaurants, developers and tour operators — across the Middle East and beyond. Different worlds, same obsession with the first three seconds.",
      keywords: ["clients", "brands", "worked", "portfolio", "companies"],
      preset: true,
    },
    {
      id: "process",
      question: "What's your process?",
      answer:
        "I watch everything once without touching it. Then I build the spine, find the music, and cut until nothing can come out without the film falling apart.",
      keywords: ["process", "workflow", "how", "approach", "method"],
      preset: true,
    },
    {
      id: "time",
      question: "How fast can you turn a project around?",
      answer:
        "A social reel in a day or two, a brand film in about a week. Being a one-man studio means nobody waits on anybody.",
      keywords: ["fast", "time", "turnaround", "deadline", "long", "quick"],
      preset: true,
    },
    {
      id: "hire",
      question: "How do I hire you?",
      answer:
        "Send me the brief and a deadline from the contact page. I answer within a day — usually with questions that make the brief better.",
      keywords: ["hire", "contact", "book", "price", "cost", "rate", "email", "work together"],
      preset: true,
    },
  ],
  poses: { waiting: "center", talking: "talking", emphasis: "emphasis", pensive: "pensive", thanks: "smile" },
  tts: { enabled: true, voice: "", rate: 1, pitch: 0.9, volume: 0.9 },
  crt: true,
  subtitles: true,
  waveform: true,
};

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
  styles: {},
};

export const DEFAULT_HERO_CONFIG: HeroConfig = {
  poses: { ladder: DEFAULT_LADDER, up: DEFAULT_UP, down: DEFAULT_DOWN },
  expressions: DEFAULT_EXPRESSIONS,
  logos: {
    enabled: true,
    scale: 1,
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
  confrontation: DEFAULT_CONFRONTATION,
  interview: DEFAULT_INTERVIEW,
};
