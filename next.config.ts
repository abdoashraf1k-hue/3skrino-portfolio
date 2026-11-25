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
  // public/ files have no content hash, so the platform default is "max-age=0, must-revalidate":
  // every visit re-checks each hero layer, logo and model. Images, models and audio can be
  // reused for a day and served stale while they revalidate; the hero pages and their runtime
  // (which must stay in step with each other) only for five minutes.
  async headers() {
    const media = "public, max-age=86400, stale-while-revalidate=2592000";
    const pages = "public, max-age=300, stale-while-revalidate=86400";
    return [
      ...["/heroes/assets/:path*", "/heroes/thumbs/:path*", "/hero/:path*", "/brands/:path*", "/models/:path*", "/audio/:path*"].map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: media }],
      })),
      ...["/heroes/heroes/:path*", "/heroes/runtime/:path*", "/heroes/heroes.json"].map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: pages }],
      })),
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
