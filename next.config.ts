import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sprint 9.2: the site is organised as three cuts. Old URLs redirect
  // permanently (query strings carry over, so shared reel-player links still
  // open the right reel). /work/[category] pages are unchanged.
  async redirects() {
    return [
      { source: "/work", destination: "/", permanent: true },
      // Sprint 13: /reels?brand=<id> is the brand-filtered reels page, so only the
      // legacy reel-player links (?view= / ?reel=) still go to Vertical Cuts.
      { source: "/reels", has: [{ type: "query", key: "view" }], destination: "/vertical-cuts", permanent: true },
      { source: "/reels", has: [{ type: "query", key: "reel" }], destination: "/vertical-cuts", permanent: true },
      { source: "/ai", destination: "/ai-cuts", permanent: true },
    ];
  },
  // Sprint 14: the admin's angle detector loads Human in the browser only, but the
  // package's "node" export (→ @tensorflow/tfjs-node) would be bundled for SSR.
  // Every import gets the self-contained browser ESM build instead.
  turbopack: {
    resolveAlias: {
      "@vladmandic/human": "./node_modules/@vladmandic/human/dist/human.esm.js",
    },
  },
  images: {
    remotePatterns: [
      // Vercel Blob — current uploads (videos/ + thumbnails/)
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      // Cloudinary — legacy uploads that are still referenced in data/projects.ts
      { protocol: "https", hostname: "res.cloudinary.com" },
      // The site's own /media/<key> redirects (thumbnails stored in a private bucket)
      { protocol: "https", hostname: "3skrino.com" },
      { protocol: "https", hostname: "www.3skrino.com" },
    ],
  },
};

export default nextConfig;
