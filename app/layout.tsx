import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/react";
import type { Metadata, Viewport } from "next";
import { Anton, Archivo_Black, Bebas_Neue, Inter, JetBrains_Mono, Oswald } from "next/font/google";
import AnalyticsListener from "@/components/ui/AnalyticsListener";
import CommandPalette from "@/components/ui/CommandPalette";
import Cursor from "@/components/ui/Cursor";
import FxRoot from "@/components/fx/FxRoot";
import Footer from "@/components/ui/Footer";
import Grain from "@/components/ui/Grain";
import Navigation from "@/components/ui/Navigation";
import PageTransition from "@/components/ui/PageTransition";
import PwaManager from "@/components/ui/PwaManager";
import ScrollTop from "@/components/ui/ScrollTop";
import SectionRail from "@/components/ui/SectionRail";
import SiteStyle from "@/components/ui/SiteStyle";
import SignatureMoments from "@/components/ui/SignatureMoments";
import SmoothScroll from "@/components/ui/SmoothScroll";
import { site } from "@/data/site";
import { siteConfig } from "@/data/site-config";
import { jsonLd, personSchema, SITE_URL } from "@/lib/seo";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";
import "./cinematic.css";

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

// Display faces (admin → Theme picks one for headlines, one for labels). Every
// face is declared, but a browser only downloads the files whose glyphs are
// actually used — so only the two in play cost anything. Anton + Archivo Black
// are the defaults and are preloaded.
const anton = Anton({ variable: "--font-anton", weight: "400", subsets: ["latin"], display: "swap" });
const archivo = Archivo_Black({ variable: "--font-archivo", weight: "400", subsets: ["latin"], display: "swap" });
const bebas = Bebas_Neue({ variable: "--font-bebas", weight: "400", subsets: ["latin"], display: "swap", preload: false });
const oswald = Oswald({ variable: "--font-oswald", weight: "700", subsets: ["latin"], display: "swap", preload: false });
const fontVars = [inter, jetbrains, anton, archivo, bebas, oswald].map((f) => f.variable).join(" ");

const { siteTitle: title, siteDescription: description } = siteConfig.content;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: title,
    template: `%s — ${site.name}`,
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
    title,
    description,
    url: "/",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title, description },
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
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${fontVars} antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(personSchema()) }} />
      </head>
      <body className="min-h-screen">
        <SiteStyle />
        <SmoothScroll>
          <PageTransition>
            <Grain />
            <FxRoot />
            <Cursor />
            <Navigation />
            <main>{children}</main>
            <Footer />
            <CommandPalette />
            <PwaManager />
            <SectionRail />
            <ScrollTop />
            <SignatureMoments />
          </PageTransition>
        </SmoothScroll>
        <AnalyticsListener />
        <Analytics />
      </body>
      {gaId && <GoogleAnalytics gaId={gaId} />}
    </html>
  );
}
