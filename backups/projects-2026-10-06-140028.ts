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
    id: "twist-unofficial",
    accentColor: "#e7fe55",
    orientation: "horizontal",
    title: "TWIST (UNOFFICIAL)",
    category: "ai",
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
    id: "rz-lexus-copy",
    accentColor: "#e7fe55",
    orientation: "vertical",
    title: "RZ-LEXUS",
    category: "automotive",
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
    filmed: false,
    directed: true,
    edited: true,
    thumbnailSource: "auto",
    createdAt: "2026-10-02T01:33:46.163Z",
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
      "https://ugluqj98dbjzamqi.public.blob.vercel-storage.com/thumbnails/1790910867068-e56d07b0-8563-4f2f-9346-ebb5c43ab5f8.jpg",
    featured: true,
    filmed: true,
    directed: true,
    edited: true,
    thumbnailSource: "auto",
  },
  {
    id: "downtown-mall-marathon",
    accentColor: "#e7fe55",
    orientation: "horizontal",
    title: "DOWNTOWN MALL MARATHON",
    category: "sports",
    year: 2026,
    client: "DOWNTOWN MALL",
    role: "Editor",
    tools: ["Premiere Pro"],
    duration: "01:42",
    description: "",
    videoUrl:
      "https://ugluqj98dbjzamqi.public.blob.vercel-storage.com/videos/1790904976757-50fa8732-9fb9-461c-8c93-b2e6588cfc17.mp4",
    thumbnail:
      "https://ugluqj98dbjzamqi.public.blob.vercel-storage.com/thumbnails/1790905254275-db3204ae-e580-4233-85b1-0d17e7e53acc.jpg",
    featured: true,
    filmed: false,
    directed: false,
    edited: true,
    tags: ["downtown", "mall", "marathon"],
    thumbnailSource: "auto",
    createdAt: "2026-09-30T14:40:16.046Z",
  },
  {
    id: "ama-sushi",
    accentColor: "#e7fe55",
    orientation: "vertical",
    title: "AMA SUSHI X DOWNTOWN MALL",
    category: "restaurants",
    year: 2026,
    client: "DOWNTOWN MALL",
    role: "Editor",
    tools: ["Premiere Pro-Aftereffects"],
    duration: "00:17",
    description: "",
    videoUrl:
      "https://res.cloudinary.com/gnstqf5t/video/upload/v1790709851/wt2bfjipongwj31frmph.mp4",
    thumbnail:
      "https://res.cloudinary.com/gnstqf5t/video/upload/q_auto,f_auto,w_450,h_800,c_fill,so_1/wt2bfjipongwj31frmph.jpg",
    featured: true,
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
      "https://ugluqj98dbjzamqi.public.blob.vercel-storage.com/thumbnails/1791293652835-ec84c31d-0d20-48df-9c8b-42f18a2f90b5.jpg",
    featured: true,
    filmed: false,
    directed: false,
    edited: true,
    thumbnailSource: "auto",
  },
  {
    id: "al-ahly-vs-miami-one-world-tours",
    accentColor: "#e7fe55",
    orientation: "vertical",
    title: "AL AHLY VS MIAMI (ONE WORLD TOURS)",
    category: "sports",
    year: 2026,
    client: "ONE WORLD TOURS",
    role: "Editor",
    tools: ["Premiere Pro"],
    duration: "00:32",
    description: "",
    videoUrl:
      "https://ugluqj98dbjzamqi.public.blob.vercel-storage.com/videos/1790905078735-65784531-9a32-4159-91d1-2c2e8bfad4ab.mp4",
    thumbnail:
      "https://ugluqj98dbjzamqi.public.blob.vercel-storage.com/thumbnails/1790905142137-fc6475b6-e490-4dc6-b1c3-4549254707d1.jpg",
    filmed: false,
    directed: false,
    edited: true,
    thumbnailSource: "auto",
    createdAt: "2026-10-02T01:40:48.063Z",
  },
  {
    id: "2025-recap-one-world-tours",
    accentColor: "#e7fe55",
    orientation: "vertical",
    title: "2025 RECAP ONE WORLD TOURS",
    category: "tours",
    year: 2025,
    client: "ONE WORLD TOURS",
    role: "Editor",
    tools: ["Premiere Pro", "After Effects"],
    duration: "00:55",
    description: "",
    videoUrl:
      "https://ugluqj98dbjzamqi.public.blob.vercel-storage.com/videos/1790905188602-a9ed15aa-b7f8-4710-8ef2-095d117f5e36.mp4",
    thumbnail:
      "https://ugluqj98dbjzamqi.public.blob.vercel-storage.com/thumbnails/1790905188963-24b43179-fe17-401c-872d-69937da3c55f.jpg",
    filmed: false,
    directed: true,
    edited: true,
    tags: ["recap", "world", "tours"],
    thumbnailSource: "auto",
    createdAt: "2026-10-02T01:41:14.030Z",
  },
  {
    id: "frogz-edition",
    accentColor: "#e7fe55",
    orientation: "vertical",
    title: "FROGZ EDITION",
    category: "ai",
    year: 2025,
    client: "FROGZ ADVERTISING AGENCY",
    role: "AI Director, Editor",
    tools: ["Runway"],
    duration: "00:32",
    description: "",
    videoUrl:
      "https://ugluqj98dbjzamqi.public.blob.vercel-storage.com/videos/1791287344253-4da88730-443a-4ca9-8c85-38f115de5a89.mp4",
    thumbnail:
      "https://ugluqj98dbjzamqi.public.blob.vercel-storage.com/thumbnails/1791287426594-7ebe6ec0-bfe1-4b07-8190-a7717d25d28e.jpg",
    featured: true,
    filmed: false,
    directed: true,
    edited: true,
    tags: ["frogz", "edition", "ai", "video"],
    thumbnailSource: "auto",
    createdAt: "2026-10-06T11:51:06.809Z",
  },
  {
    id: "black-friday-in-downtown-mall",
    accentColor: "#e7fe55",
    orientation: "vertical",
    title: "BLACK FRIDAY IN DOWNTOWN MALL",
    category: "corporate",
    year: 2026,
    client: "DOWNTOWN MALL",
    role: "Editor",
    tools: ["Premiere Pro", "After Effects"],
    duration: "00:09",
    description: "",
    videoUrl:
      "https://ugluqj98dbjzamqi.public.blob.vercel-storage.com/videos/1791288011776-63240552-62dd-41b6-871b-f642d30a957a.mp4",
    thumbnail:
      "https://ugluqj98dbjzamqi.public.blob.vercel-storage.com/thumbnails/1791288015910-5ceb0fa8-1239-428c-b41d-fdb8bf9bd7f0.jpg",
    filmed: true,
    directed: true,
    edited: true,
    thumbnailSource: "auto",
    createdAt: "2026-10-06T11:58:30.947Z",
  },
  {
    id: "waw-designs",
    accentColor: "#e7fe55",
    orientation: "vertical",
    title: "WAW DESIGNS",
    category: "furniture",
    year: 2025,
    client: "DOWNTOWN MALL",
    role: "Editor",
    tools: ["Premiere Pro"],
    duration: "00:30",
    description: "",
    videoUrl:
      "https://ugluqj98dbjzamqi.public.blob.vercel-storage.com/videos/1791294683935-d530da66-c665-4aa0-a7a8-6cf987719e8a.mp4",
    thumbnail:
      "https://ugluqj98dbjzamqi.public.blob.vercel-storage.com/thumbnails/1791294740547-4f67aa1c-14bd-414b-9461-3b00859bb687.jpg",
    filmed: true,
    directed: true,
    edited: true,
    thumbnailSource: "auto",
    createdAt: "2026-10-06T13:53:39.404Z",
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

/** The three cuts. Vertical / horizontal include AI work in that format; AI Cuts collects every AI piece. */
export const verticalProjects = projects.filter((p) => p.orientation === "vertical");
export const horizontalProjects = projects.filter((p) => p.orientation === "horizontal");
export const aiProjects = projects.filter((p) => p.category === "ai");

export function getProject(category: string, id: string): Project | undefined {
  return projects.find((p) => p.category === category && p.id === id);
}

export function getProjectsByCategory(category: string): Project[] {
  return projects.filter((p) => p.category === category);
}

export function projectHref(project: Project): string {
  return `/work/${project.category}/${project.id}`;
}
