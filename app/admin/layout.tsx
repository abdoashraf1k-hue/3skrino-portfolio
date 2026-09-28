import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Minimal shell. The root layout still wraps this route, so admin.css hides
 * the site's nav / footer / grain / cursor / iris while [data-admin-root] is
 * on the page — without touching any public-site file.
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div data-admin-root className="min-h-screen bg-[#0a0a0a] text-white">
      {children}
    </div>
  );
}
