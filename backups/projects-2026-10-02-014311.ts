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
      "https://ugluqj98dbjzamqi.public.blob.vercel-storage.com/thumbnails/1790904474041-df1cf1c0-4a3f-4c91-bf5e-9c72f324dffc.jpg",
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
      "https://res.cloudinary.com/gnstqf5t/video/upload/q_auto,f_auto,w_450,h_800,c_fill,so_1/ywy46evz68uqpfjrwmyx.jpg",
    featured: true,
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
