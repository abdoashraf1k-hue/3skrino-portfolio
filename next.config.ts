import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sprint 9.2: the site is organised as three cuts. Old URLs redirect
  // permanently (query strings carry over, so shared reel-player links still
  // open the right reel). /work/[category] pages are unchanged.
  async redirects() {
    return [
      { source: "/work", destination: "/", permanent: true },
      { source: "/reels", destination: "/vertical-cuts", permanent: true },
      { source: "/ai", destination: "/ai-cuts", permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      // Vercel Blob — current uploads (videos/ + thumbnails/)
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      // Cloudinary — legacy uploads that are still referenced in data/projects.ts
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
  },
};

export default nextConfig;
