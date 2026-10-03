import { siteConfig } from "./site-config";

/** Identity. Email / location / role are edited from /admin → Content (data/site-config.ts). */
export const site = {
  name: "3SKRINO",
  email: siteConfig.content.email,
  location: siteConfig.content.location,
  role: siteConfig.content.role,
};

export const socials = siteConfig.content.socials;

/** `short` is used where the nav is tight (tablet). */
export const navLinks = [
  { label: "Vertical Cuts", short: "Vertical", href: "/vertical-cuts" },
  { label: "Horizontal Cuts", short: "Horizontal", href: "/horizontal-cuts" },
  { label: "AI Cuts", short: "AI", href: "/ai-cuts" },
  { label: "About", short: "About", href: "/about" },
  { label: "Contact", short: "Contact", href: "/contact" },
] as const;

export const roles = [
  { label: "Video Editor", icon: "✦" },
  { label: "Colorist", icon: "◉" },
  { label: "Motion Designer", icon: "▣" },
  { label: "Content Creator", icon: "⬢" },
  { label: "AI Video Artist", icon: "◆" },
  { label: "Reel Maker", icon: "✧" },
];

export const tools = [
  "Premiere Pro",
  "After Effects",
  "DaVinci Resolve",
  "Figma",
  "Midjourney",
  "Runway",
  "Sora",
  "Kling",
  "ElevenLabs",
];
