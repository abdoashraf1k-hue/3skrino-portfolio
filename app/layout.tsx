import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/react";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import AnalyticsListener from "@/components/ui/AnalyticsListener";
import CommandPalette from "@/components/ui/CommandPalette";
import Cursor from "@/components/ui/Cursor";
import Footer from "@/components/ui/Footer";
import Grain from "@/components/ui/Grain";
import Navigation from "@/components/ui/Navigation";
import PageTransition from "@/components/ui/PageTransition";
import PwaManager from "@/components/ui/PwaManager";
import SmoothScroll from "@/components/ui/SmoothScroll";
import { site } from "@/data/site";
import { jsonLd, personSchema, SITE_URL } from "@/lib/seo";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Variable font (no fixed weights) — covers 400–900; italic powers the editorial accent words.
// next/font self-hosts and preloads both families; no request ever goes to Google at runtime.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

const description =
  "3SKRINO is a Cairo-based senior video editor and content creator with 9+ years cutting brand films, commercials, social reels and AI-driven visuals.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "3SKRINO — Video Editor & Content Creator",
    template: "%s — 3SKRINO",
  },
  description,
  applicationName: site.name,
  authors: [{ name: site.name, url: SITE_URL }],
  creator: site.name,
  alternates: {
    canonical: "/",
    types: { "application/rss+xml": [{ url: "/feed.xml", title: `${site.name} — Work` }] },
  },
  openGraph: {
    type: "website",
    siteName: site.name,
    title: "3SKRINO — Video Editor & Content Creator",
    description,
    url: "/",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: "3SKRINO — Video Editor & Content Creator", description },
  appleWebApp: { capable: true, title: site.name, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  return (
    // data-theme is set by the boot script before paint — the server can't know it.
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${inter.variable} ${jetbrains.variable} antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(personSchema()) }} />
      </head>
      <body className="min-h-screen">
        <SmoothScroll>
          <PageTransition>
            <Grain />
            <Cursor />
            <Navigation />
            <main>{children}</main>
            <Footer />
            <CommandPalette />
            <PwaManager />
          </PageTransition>
        </SmoothScroll>
        <AnalyticsListener />
        <Analytics />
      </body>
      {gaId && <GoogleAnalytics gaId={gaId} />}
    </html>
  );
}
