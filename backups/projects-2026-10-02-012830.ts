export type Project = {
  id: string;
  title: string;
  /** Matches a category id in data/categories.ts */
  category: string;
  year: number;
  client: string;
  role: string;
  tools: string[];
  duration: string;
  description: string;
  /** Empty until real footage is uploaded — the player shows a placeholder. */
  videoUrl: string;
  /** Empty until real stills exist — cards fall back to a gradient. */
  thumbnail: string;
  featured?: boolean;
  /** Per-project hover accent: glow, timecode, arrow. */
  accentColor: string;
  /** 90% of the work is 9:16 — vertical is the default. */
  orientation: "vertical" | "horizontal";
  /** Credits shown as badges. `edited` defaults to true when omitted. */
  filmed?: boolean;
  directed?: boolean;
  edited?: boolean;
  /** Free-form keywords (search, AI suggestions). */
  tags?: string[];
  /** Whether `thumbnail` was grabbed from the video or uploaded by hand. */
  thumbnailSource?: "auto" | "manual";
  /** ISO timestamp, set by the admin when the project is created. */
  createdAt?: string;
};

export type ProjectCredits = { filmed: boolean; directed: boolean; edited: boolean };

/** Resolved credits with defaults applied (edited unless explicitly false). */
export function projectCredits(p: Pick<Project, "filmed" | "directed" | "edited">): ProjectCredits {
  return { filmed: Boolean(p.filmed), directed: Boolean(p.directed), edited: p.edited !== false };
}

export const projects: Project[] = [
  {
    id: "night-run",
    accentColor: "#ff5a36",
    orientation: "vertical",
    title: "Night Run Test",
    category: "sports",
    year: 2026,
    client: "Stride Athletics",
    role: "Editor, Colorist",
    tools: ["Premiere Pro", "DaVinci Resolve"],
    duration: "01:30",
    description:
      "A high-tempo campaign film following amateur runners through Cairo after midnight. Cut to a pulsing score with speed-ramped transitions and a crushed, high-contrast grade.",
    videoUrl: "",
    thumbnail: "",
    featured: true,
    filmed: true,
    directed: true,
    edited: true,
  },
  {
    id: "quiet-luxury",
    accentColor: "#d8c3a5",
    orientation: "vertical",
    title: "Quiet Luxury",
    category: "fashion",
    year: 2025,
    client: "Maison Noor",
    role: "Editor, Motion",
    tools: ["Premiere Pro", "After Effects"],
    duration: "00:45",
    description:
      "A slow, tactile lookbook film for an SS25 capsule. Long holds, macro fabric textures and restrained typography let the garments do the talking.",
    videoUrl: "",
    thumbnail: "",
    featured: true,
    filmed: true,
    directed: false,
    edited: true,
  },
  {
    id: "twist-unofficial",
    accentColor: "#e7fe55",
    orientation: "horizontal",
    title: "TWIST (UNOFFICIAL)",
    category: "lifestyle",
    year: 2026,
    client: "TWIST",
    role: "AI Director, Editor",
    tools: ["HIGGSFIELD"],
    duration: "01:02",
    description: "",
    videoUrl:
      "https://res.cloudinary.com/gnstqf5t/video/upload/v1790767671/q9n1asudfeuqslxakb9z.mp4",
    thumbnail:
      "https://ugluqj98dbjzamqi.public.blob.vercel-storage.com/thumbnails/1790778374492-c51a0bcd-7e5c-4962-a1da-7e64e8b9dc05.jpg",
    featured: true,
    filmed: true,
    directed: true,
    edited: true,
    tags: ["twist", "unofficial", "lifestyle", "video"],
    thumbnailSource: "auto",
  },
  {
    id: "rz-lexus",
    accentColor: "#e7fe55",
    orientation: "vertical",
    title: "RZ-LEXUS",
    category: "ai",
    year: 2026,
    client: "LEXUS",
    role: "Editor",
    tools: ["HIGGSFIELD", "Premiere Pro", "After Effects"],
    duration: "00:18",
    description: "",
    videoUrl:
      "https://ugluqj98dbjzamqi.public.blob.vercel-storage.com/videos/1790783137369-1886a927-c6d7-4f58-b77c-228fcec58c43.mp4",
    thumbnail:
      "https://ugluqj98dbjzamqi.public.blob.vercel-storage.com/thumbnails/1790783278733-eec604d5-0bbb-458f-98be-f5e78911ee1e.jpg",
    featured: true,
    filmed: false,
    directed: true,
    edited: true,
    thumbnailSource: "auto",
    createdAt: "2026-09-30T15:48:04.982Z",
  },
  {
    id: "built-to-scale",
    accentColor: "#7aa7ff",
    orientation: "horizontal",
    title: "Built to Scale",
    category: "corporate",
    year: 2024,
    client: "Northwind Group",
    role: "Editor",
    tools: ["Premiere Pro", "After Effects"],
    duration: "03:20",
    description:
      "A brand documentary about a logistics company's decade of growth, shaped from 30 hours of interviews into a tight, human story.",
    videoUrl: "",
    thumbnail: "",
    filmed: true,
    directed: false,
    edited: true,
  },
  {
    id: "gad",
    accentColor: "#e7fe55",
    orientation: "vertical",
    title: "GAD",
    category: "restaurants",
    year: 2026,
    client: "GAD RESTAURANT",
    role: "Editor+DIRECTING+SHOOTING",
    tools: ["Premiere Pro"],
    duration: "00:28",
    description: "",
    videoUrl:
      "https://res.cloudinary.com/gnstqf5t/video/upload/v1790767326/fevtvnuij6xh1lgtx0h6.mp4",
    thumbnail:
      "https://ugluqj98dbjzamqi.public.blob.vercel-storage.com/thumbnails/1790904474041-df1cf1c0-4a3f-4c91-bf5e-9c72f324dffc.jpg",
    featured: true,
    filmed: true,
    directed: true,
    edited: true,
    thumbnailSource: "auto",
  },
  {
    id: "skyline-residences",
    accentColor: "#c9b28a",
    orientation: "vertical",
    title: "Skyline Residences",
    category: "real-estate",
    year: 2024,
    client: "Horizon Developments",
    role: "Editor, Motion",
    tools: ["Premiere Pro", "After Effects"],
    duration: "01:45",
    description:
      "Drone-led property film with 3D-tracked typography and a warm, aspirational grade for a luxury tower launch.",
    videoUrl: "",
    thumbnail: "",
    filmed: true,
    directed: false,
    edited: true,
  },
  {
    id: "slow-mornings",
    accentColor: "#e8d9b0",
    orientation: "vertical",
    title: "Slow Mornings",
    category: "lifestyle",
    year: 2025,
    client: "Bloom Coffee",
    role: "Editor",
    tools: ["Premiere Pro"],
    duration: "00:30",
    description:
      "An intimate lifestyle piece about morning rituals — natural light, handheld texture and an unhurried rhythm.",
    videoUrl: "",
    thumbnail: "",
    filmed: true,
    directed: true,
    edited: true,
  },
  {
    id: "synthetic-dreams",
    accentColor: "#9b8cff",
    orientation: "horizontal",
    title: "Synthetic Dreams",
    category: "ai",
    year: 2026,
    client: "Pulse Records",
    role: "AI Director, Editor",
    tools: ["Midjourney", "Runway", "Kling", "Premiere Pro"],
    duration: "02:10",
    description:
      "A fully generated music visual built from 400+ AI shots. Directed look-development, curated generations and cut everything to beat for a single release.",
    videoUrl: "",
    thumbnail: "",
    featured: true,
    filmed: false,
    directed: true,
    edited: true,
  },
  {
    id: "neon-oasis",
    accentColor: "#ff4fd8",
    orientation: "vertical",
    title: "Neon Oasis",
    category: "ai",
    year: 2026,
    client: "Mirage Festival",
    role: "AI Director, Editor",
    tools: ["Sora", "Midjourney", "After Effects"],
    duration: "00:50",
    description:
      "A generated festival teaser imagining a desert city of light. Built as a sequence of AI shots, composited and graded for continuity.",
    videoUrl: "",
    thumbnail: "",
    filmed: false,
    directed: true,
    edited: true,
  },
  {
    id: "second-skin",
    accentColor: "#b8f0ff",
    orientation: "vertical",
    title: "Second Skin",
    category: "ai",
    year: 2025,
    client: "Atelier Rhea",
    role: "AI Director",
    tools: ["Runway", "Kling", "ElevenLabs"],
    duration: "00:35",
    description:
      "An AI fashion film where fabric morphs across impossible materials — chrome, water, sand — with a generated voiceover.",
    videoUrl: "",
    thumbnail: "",
    filmed: false,
    directed: true,
    edited: false,
  },
  {
    id: "ama-sushi",
    accentColor: "#e7fe55",
    orientation: "vertical",
    title: "AMA SUSHI",
    category: "restaurants",
    year: 2026,
    client: "AMA SUSHI",
    role: "Editor",
    tools: ["Premiere Pro-Aftereffects"],
    duration: "00:17",
    description: "",
    videoUrl:
      "https://res.cloudinary.com/gnstqf5t/video/upload/v1790709851/wt2bfjipongwj31frmph.mp4",
    thumbnail:
      "https://res.cloudinary.com/gnstqf5t/video/upload/q_auto,f_auto,w_450,h_800,c_fill,so_1/wt2bfjipongwj31frmph.jpg",
    filmed: true,
    directed: false,
    edited: true,
  },
  {
    id: "lush-mood",
    accentColor: "#e7fe55",
    orientation: "vertical",
    title: "LUSH MOOD",
    category: "restaurants",
    year: 2026,
    client: "LUSH MOOD RESTAURANTS AND CAFE",
    role: "Editor",
    tools: [],
    duration: "00:19",
    description: "",
    videoUrl:
      "https://res.cloudinary.com/gnstqf5t/video/upload/v1790767481/ywy46evz68uqpfjrwmyx.mp4",
    thumbnail:
      "https://res.cloudinary.com/gnstqf5t/video/upload/q_auto,f_auto,w_450,h_800,c_fill,so_1/ywy46evz68uqpfjrwmyx.jpg",
  },
  {
    id: "future-archive",
    accentColor: "#e7fe55",
    orientation: "vertical",
    title: "Future Archive",
    category: "ai",
    year: 2026,
    client: "Self-initiated",
    role: "AI Director, Editor",
    tools: ["Sora", "Runway", "DaVinci Resolve"],
    duration: "01:15",
    description:
      "A speculative short about a museum of memories that haven't happened yet. A test bed for AI continuity and editorial pacing.",
    videoUrl: "",
    thumbnail: "",
    filmed: false,
    directed: true,
    edited: true,
  },
  {
    id: "downtown-mall-marathon",
    accentColor: "#e7fe55",
    orientation: "horizontal",
    title: "DOWNTOWN MALL MARATHON",
    category: "lifestyle",
    year: 2026,
    client: "DOWNTOWN MALL",
    role: "Editor",
    tools: ["Premiere Pro"],
    duration: "01:42",
    description: "",
    videoUrl: "",
    thumbnail:
      "https://ugluqj98dbjzamqi.public.blob.vercel-storage.com/thumbnails/1790778984295-28701497-08cb-4842-bd20-cdc833c2714a.jpg",
    filmed: false,
    directed: false,
    edited: true,
    tags: ["downtown", "mall", "marathon"],
    thumbnailSource: "auto",
    createdAt: "2026-09-30T14:40:16.046Z",
  },
  {
    id: "the-long-drive",
    accentColor: "#5ad1c1",
    orientation: "horizontal",
    title: "The Long Drive",
    category: "automotive",
    year: 2025,
    client: "Velocity Motors",
    role: "Editor, Colorist",
    tools: ["DaVinci Resolve", "After Effects"],
    duration: "01:00",
    description:
      "A launch spot for a new electric SUV — desert roads, golden hour and a sound design pass that makes silence feel powerful.",
    videoUrl: "",
    thumbnail: "",
    featured: true,
    filmed: true,
    directed: false,
    edited: true,
  },
  {
    id: "desert-nights",
    accentColor: "#e7fe55",
    orientation: "vertical",
    title: "Desert Nights",
    category: "tours",
    year: 2026,
    client: "Placeholder — update me",
    role: "Editor & Colorist",
    tools: ["Premiere Pro", "After Effects"],
    duration: "00:45",
    description: "Tour agency campaign placeholder.",
    videoUrl: "",
    thumbnail: "",
    filmed: true,
    edited: true,
  },
];

export type Reel = {
  id: string;
  title: string;
  views: string;
  client: string;
  /** Tailwind aspect class — varied for the masonry layout on /reels */
  aspect: "aspect-[9/16]" | "aspect-[4/5]" | "aspect-[3/4]";
  duration: string;
  /** Optional footage for the /reels player; a placeholder plays when empty. */
  videoUrl?: string;
  poster?: string;
  filmed?: boolean;
  directed?: boolean;
  edited?: boolean;
};

export const reels: Reel[] = [
  { id: "r1", title: "Match Day", views: "2.4M", client: "Stride", aspect: "aspect-[9/16]", duration: "00:14" },
  { id: "r2", title: "First Bite", views: "1.1M", client: "Ember Kitchen", aspect: "aspect-[4/5]", duration: "00:22" },
  { id: "r3", title: "Drop 03", views: "860K", client: "Maison Noor", aspect: "aspect-[9/16]", duration: "00:09" },
  { id: "r4", title: "Zero to 100", views: "3.2M", client: "Velocity", aspect: "aspect-[3/4]", duration: "00:18" },
  { id: "r5", title: "Room Tour", views: "540K", client: "Horizon", aspect: "aspect-[9/16]", duration: "00:31" },
  { id: "r6", title: "AI Morph", views: "1.8M", client: "Self", aspect: "aspect-[4/5]", duration: "00:12" },
  { id: "r7", title: "Pour Over", views: "720K", client: "Bloom Coffee", aspect: "aspect-[9/16]", duration: "00:16" },
  { id: "r8", title: "Behind the Cut", views: "410K", client: "Self", aspect: "aspect-[3/4]", duration: "00:27" },
];

export const verticalProjects = projects.filter((p) => p.orientation === "vertical");
export const horizontalProjects = projects.filter((p) => p.orientation === "horizontal");

export function getProject(category: string, id: string): Project | undefined {
  return projects.find((p) => p.category === category && p.id === id);
}

export function getProjectsByCategory(category: string): Project[] {
  return projects.filter((p) => p.category === category);
}

export function projectHref(project: Project): string {
  return `/work/${project.category}/${project.id}`;
}
