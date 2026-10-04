"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HeroConfig } from "@/data/hero-config";
import type { SiteConfig } from "@/data/site-config";
import { PREVIEW_MESSAGE, PREVIEW_PARAM, PREVIEW_READY } from "@/lib/live-config";

/**
 * A small, non-interactive live frame of a site URL that renders the admin's
 * unsaved drafts (like the preview dock). Only mounts while on screen, so a
 * grid of these doesn't run five WebGL pages at once below the fold.
 */
export default function MiniPreview({
  path,
  hero,
  site,
  enabled = true,
  width = 1440,
  height = 900,
  title,
}: {
  path: string;
  hero: HeroConfig | null;
  site: SiteConfig | null;
  enabled?: boolean;
  width?: number;
  height?: number;
  title: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [visible, setVisible] = useState(false);
  const [boxW, setBoxW] = useState(0);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width));
    ro.observe(el);
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  const post = useCallback(() => {
    const win = frameRef.current?.contentWindow;
    if (win && (hero || site)) win.postMessage({ type: PREVIEW_MESSAGE, hero, site }, window.location.origin);
  }, [hero, site]);

  useEffect(() => {
    const id = window.setTimeout(post, 120);
    return () => window.clearTimeout(id);
  }, [post]);

  useEffect(() => {
    const onMsg = (e: MessageEvent<unknown>) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      const d = e.data;
      if (typeof d === "object" && d !== null && "type" in d && d.type === PREVIEW_READY) post();
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [post]);

  const scale = boxW ? boxW / width : 0.2;
  const sep = path.includes("?") ? "&" : "?";
  return (
    <div ref={boxRef} className="relative w-full overflow-hidden bg-black" style={{ aspectRatio: `${width} / ${height}` }}>
      {enabled && visible ? (
        <iframe
          ref={frameRef}
          src={`${path}${sep}${PREVIEW_PARAM}=1`}
          title={title}
          tabIndex={-1}
          aria-hidden
          onLoad={post}
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{ width, height, transform: `scale(${scale})` }}
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[9px] uppercase tracking-widest text-white/25">
          {enabled ? "Loading preview…" : "Preview paused"}
        </span>
      )}
    </div>
  );
}
