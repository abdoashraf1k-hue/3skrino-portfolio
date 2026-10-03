"use client";

import { useEffect, useRef } from "react";

const SCALE = 4; // render at 1/4 resolution, upscale via CSS
const FPS = 12;

export default function Grain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let frame = 0;
    let last = 0;
    let image: ImageData | null = null;

    const resize = () => {
      canvas.width = Math.ceil(window.innerWidth / SCALE);
      canvas.height = Math.ceil(window.innerHeight / SCALE);
      image = ctx.createImageData(canvas.width, canvas.height);
      draw();
    };

    const draw = () => {
      if (!image) return;
      const data = image.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
    };

    const loop = (t: number) => {
      frame = requestAnimationFrame(loop);
      if (t - last < 1000 / FPS) return;
      last = t;
      draw();
    };

    resize();
    window.addEventListener("resize", resize);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[90] h-full w-full mix-blend-overlay [image-rendering:pixelated]"
      // Strength comes from the theme (data/site-config.ts → theme.grain).
      style={{ opacity: "var(--grain-opacity)" }}
    />
  );
}
