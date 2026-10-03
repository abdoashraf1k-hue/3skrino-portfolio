import { ImageResponse } from "next/og";
import { site } from "@/data/site";
import { siteConfig } from "@/data/site-config";
import { SITE_URL } from "@/lib/seo";

/**
 * Shared renderers for the generated icons and social cards (built once at
 * build time). Inter Black is fetched from Google Fonts as TTF; if that fails
 * (offline build) the bundled default font is used instead of failing.
 */

/** Brand colours follow the theme (data/site-config.ts). */
export const ACCENT = siteConfig.theme.accent;
export const BG = siteConfig.theme.bg;

type Font = { name: string; data: ArrayBuffer; weight: 900; style: "normal" };

export async function interBlack(text: string): Promise<Font[]> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Inter:wght@900&text=${encodeURIComponent(text)}`,
      { signal: AbortSignal.timeout(5000) },
    ).then((r) => r.text());
    const src = /src: url\((.+?)\) format\('(opentype|truetype)'\)/.exec(css)?.[1];
    if (!src) return [];
    const data = await fetch(src, { signal: AbortSignal.timeout(5000) }).then((r) => r.arrayBuffer());
    return [{ name: "Inter", data, weight: 900, style: "normal" }];
  } catch {
    return [];
  }
}

/** Square "3" monogram — favicon and apple-touch icon. */
export async function monogram(size: number): Promise<ImageResponse> {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BG,
          borderRadius: size > 64 ? size * 0.22 : size * 0.18,
          color: ACCENT,
          fontFamily: "Inter",
          fontWeight: 900,
          fontSize: size * 0.78,
          lineHeight: 1,
          letterSpacing: "-0.04em",
        }}
      >
        3
      </div>
    ),
    { width: size, height: size, fonts: await interBlack("3") },
  );
}

/** 1200×630 social card. */
export async function socialCard({ eyebrow = "Portfolio — Cairo → Worldwide" }: { eyebrow?: string } = {}): Promise<ImageResponse> {
  const host = SITE_URL.replace(/^https?:\/\//, "");
  const text = `${site.name}${site.role}${host}${eyebrow}0123456789→—&`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: `radial-gradient(70% 90% at 78% 12%, rgba(231,254,85,0.16) 0%, rgba(231,254,85,0) 60%), ${BG}`,
          color: "#f5f5f5",
          fontFamily: "Inter",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 22, letterSpacing: "0.2em", textTransform: "uppercase", color: "#8a8a8a" }}>
          <div style={{ width: 12, height: 12, borderRadius: 999, background: ACCENT }} />
          {eyebrow}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 212, fontWeight: 900, lineHeight: 0.9, letterSpacing: "-0.05em" }}>{site.name}</div>
          <div style={{ marginTop: 28, fontSize: 40, fontWeight: 900, color: ACCENT, letterSpacing: "-0.01em" }}>{site.role}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#8a8a8a", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          <span>Brand films · Commercials · Reels · AI</span>
          <span style={{ color: "#f5f5f5" }}>{host}</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: await interBlack(text) },
  );
}

/**
 * An uploaded image (admin → Content: favicon / share image), covering the
 * whole canvas. Relative paths resolve against the canonical origin.
 */
export function uploadedImage(src: string, width: number, height: number): ImageResponse {
  const url = new URL(src, SITE_URL).toString();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: BG }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain <img> */}
        <img src={url} alt="" width={width} height={height} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    ),
    { width, height },
  );
}
