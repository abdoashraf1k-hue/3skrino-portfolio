import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Cursor from "@/components/ui/Cursor";
import Footer from "@/components/ui/Footer";
import Grain from "@/components/ui/Grain";
import Navigation from "@/components/ui/Navigation";
import SmoothScroll from "@/components/ui/SmoothScroll";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
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
          <Grain />
          <Cursor />
          <Navigation />
          <main>{children}</main>
          <Footer />
        </SmoothScroll>
      </body>
    </html>
  );
}
