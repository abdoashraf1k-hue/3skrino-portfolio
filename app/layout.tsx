import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Cursor from "@/components/ui/Cursor";
import Footer from "@/components/ui/Footer";
import Grain from "@/components/ui/Grain";
import Navigation from "@/components/ui/Navigation";
import PageTransition from "@/components/ui/PageTransition";
import SmoothScroll from "@/components/ui/SmoothScroll";
import "./globals.css";

// Variable font (no fixed weights) — covers 400–900; italic powers the editorial accent words.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "3SKRINO — Video Editor & Content Creator",
    template: "%s — 3SKRINO",
  },
  description:
    "3SKRINO is a Cairo-based senior video editor and content creator with 9+ years cutting brand films, commercials, social reels and AI-driven visuals.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable} antialiased`}>
      <body className="min-h-screen">
        <SmoothScroll>
          <PageTransition>
            <Grain />
            <Cursor />
            <Navigation />
            <main>{children}</main>
            <Footer />
          </PageTransition>
        </SmoothScroll>
      </body>
    </html>
  );
}
