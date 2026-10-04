"use client";

import { useEffect, useRef } from "react";
import { useCinematic, useEffectActive } from "@/lib/cinematic";

const SCALE = 4; // render at 1/4 resolution, upscale via CSS
const FPS = 12;

/**
 * Film grain over the whole site. By default its strength is the theme's
 * (admin → Theme → grain); admin → Effects → Film grain takes over with its
 * own intensity, flicker rate and dust. Reduced motion: one static frame.
 */
export default function Grain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { filmGrain } = useCinematic().effects;
  const active = useEffectActive("filmGrain");
  const tune = useRef({ fps: FPS, dust: 0 });

  useEffect(() => {
    tune.current = active ? { fps: filmGrain.flicker, dust: filmGrain.dust } : { fps: FPS, dust: 0 };
  }, [active, filmGrain.flicker, filmGrain.dust]);

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
      // Dust: a few dark specks and the odd hair, different every frame.
      const dust = tune.current.dust;
      if (dust > 0) {
        const n = Math.round(dust * 28);
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = Math.random() < 0.7 ? "#000" : "#fff";
          ctx.beginPath();
          ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, 0.4 + Math.random() * 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
        if (Math.random() < dust * 0.25) {
          ctx.strokeStyle = "#000";
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          const x = Math.random() * canvas.width;
          const y = Math.random() * canvas.height;
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + 6 - Math.random() * 12, y + 4, x + 8 - Math.random() * 16, y + 10 + Math.random() * 6);
          ctx.stroke();
        }
      }
    };

    const loop = (t: number) => {
      frame = requestAnimationFrame(loop);
      if (t - last < 1000 / tune.current.fps) return;
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
      // Strength: the theme's grain (data/site-config.ts → theme.grain), or the Film grain effect's intensity.
      style={{ opacity: active ? filmGrain.intensity * 2.2 : "var(--grain-opacity)" }}
    />
  );
}
