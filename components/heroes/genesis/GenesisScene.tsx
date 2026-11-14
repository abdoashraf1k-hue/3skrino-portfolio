"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import type { GenesisBackground, GenesisPalette } from "@/data/hero-config";
import { sameOriginMedia } from "@/lib/media-url";
import { BACKGROUND_FRAGMENTS, gridFragment, horizonFragment, horizonVertex, screenVertex, watermarkFragment, worldVertex } from "./shaders";

/**
 * Sprint 15 — the Genesis hero's WebGL layer, behind the 360° portrait (which
 * ImageSequenceHero draws on its own Canvas 2D on top): one canvas, three
 * draws, back to front —
 *   1. a full-screen procedural backdrop (one of four GLSL presets),
 *   2. the retro grid floor in perspective, dissolving into the horizon,
 *   3. the watermark (uploaded logo or the site name) with glitch +
 *      chromatic aberration + neon glow, sitting behind the head.
 *
 * Following the R3F skill: materials / geometries / textures are built in
 * useMemo (never inside useFrame) and disposed on swap and unmount; useFrame
 * only writes into preallocated uniforms (colours lerp in place, vectors use
 * .set), so the loop allocates nothing. Rendering stops while the hero is
 * off-screen (frameloop "never"), and PerformanceMonitor drops the pixel
 * ratio if the frame rate sags.
 */

export type Pointer = { x: number; y: number };

const ease = (k: number, delta: number) => 1 - Math.exp(-k * delta);
const FLOOR_Y = -1.4;
/** Where the watermark's centre sits, as a fraction of the stage height from the top. */
const MARK_Y = 0.36;
/** The watermark never gets taller than this fraction of the stage. */
const MARK_MAX_H = 0.4;
/** Reduced motion: one frozen, pleasant moment of every shader. */
const FROZEN_T = 14;

/** The scene's one clock: `t` drives the shaders (frozen under reduced motion), `age` is real time since mount. */
type Clock = { t: number; age: number; frozen: boolean };
type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

/** Palette uniforms shared by every material; lerped toward the targets in one place each frame. */
function usePaletteUniforms(palette: GenesisPalette) {
  const uniforms = useMemo(
    () => ({
      uBg: { value: new THREE.Color(palette.background) },
      uTint: { value: new THREE.Color(palette.tint) },
      uAccent: { value: new THREE.Color(palette.accent) },
      uGlow: { value: new THREE.Color(palette.glow) },
      uGrid: { value: new THREE.Color(palette.grid) },
    }),
    // Built once: later palettes ease in through the targets below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const targets = useMemo(
    () => ({ uBg: new THREE.Color(), uTint: new THREE.Color(), uAccent: new THREE.Color(), uGlow: new THREE.Color(), uGrid: new THREE.Color() }),
    [],
  );
  useEffect(() => {
    targets.uBg.set(palette.background);
    targets.uTint.set(palette.tint);
    targets.uAccent.set(palette.accent);
    targets.uGlow.set(palette.glow);
    targets.uGrid.set(palette.grid);
  }, [palette, targets]);
  useFrame((_, delta) => {
    const k = ease(4, delta);
    uniforms.uBg.value.lerp(targets.uBg, k);
    uniforms.uTint.value.lerp(targets.uTint, k);
    uniforms.uAccent.value.lerp(targets.uAccent, k);
    uniforms.uGlow.value.lerp(targets.uGlow, k);
    uniforms.uGrid.value.lerp(targets.uGrid, k);
  });
  return uniforms;
}

type PaletteUniforms = ReturnType<typeof usePaletteUniforms>;

/* ------------------------------------------------------------------ */
/* 1. Backdrop                                                         */
/* ------------------------------------------------------------------ */

function Backdrop({ preset, colors, clock, pointer }: { preset: GenesisBackground; colors: PaletteUniforms; clock: RefObject<Clock>; pointer: RefObject<Pointer> }) {
  const mesh = useRef<ShaderMesh>(null);
  // A new preset compiles a new program; the old one is disposed below.
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: screenVertex,
        fragmentShader: BACKGROUND_FRAGMENTS[preset],
        uniforms: {
          uTime: { value: 0 },
          uRes: { value: new THREE.Vector2(1, 1) },
          uMouse: { value: new THREE.Vector2() },
          uBg: colors.uBg,
          uTint: colors.uTint,
          uAccent: colors.uAccent,
          uGlow: colors.uGlow,
        },
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [preset, colors],
  );
  useEffect(() => () => material.dispose(), [material]);

  // Writes into the live material's uniforms, reached through the mesh (as HeroScene does): nothing allocated per frame.
  useFrame((state, delta) => {
    const u = mesh.current?.material.uniforms;
    if (!u) return;
    u.uTime.value = clock.current.t;
    (u.uRes.value as THREE.Vector2).set(state.size.width * state.viewport.dpr, state.size.height * state.viewport.dpr);
    const m = u.uMouse.value as THREE.Vector2;
    const p = pointer.current;
    const k = clock.current.frozen ? 1 : ease(3, delta);
    m.x += (p.x - m.x) * k;
    m.y += (p.y - m.y) * k;
  });

  return (
    <mesh ref={mesh} frustumCulled={false} renderOrder={-10} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Retro grid                                                       */
/* ------------------------------------------------------------------ */

function Grid({ colors, clock }: { colors: PaletteUniforms; clock: RefObject<Clock> }) {
  const mesh = useRef<ShaderMesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: worldVertex,
        fragmentShader: gridFragment,
        uniforms: { uTime: { value: 0 }, uIntro: { value: 0 }, uGrid: colors.uGrid, uAccent: colors.uAccent },
        // Additive: where the grid fades to black it adds nothing, so the backdrop shows through.
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [colors],
  );
  useEffect(() => () => material.dispose(), [material]);

  const wall = useRef<ShaderMesh>(null);
  const glow = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: horizonVertex,
        fragmentShader: horizonFragment,
        uniforms: { uIntro: { value: 0 }, uAccent: colors.uAccent },
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [colors],
  );
  useEffect(() => () => glow.dispose(), [glow]);

  useFrame(() => {
    const u = mesh.current?.material.uniforms;
    const w = wall.current?.material.uniforms;
    if (!u || !w) return;
    const c = clock.current;
    u.uTime.value = c.t;
    // The floor draws itself in over 1.6s.
    const k = Math.min(1, c.age / 1.6);
    u.uIntro.value = c.frozen ? 1 : 1 - Math.pow(1 - k, 3);
    w.uIntro.value = u.uIntro.value;
  });

  return (
    <>
      <mesh ref={mesh} rotation-x={-Math.PI / 2} position={[0, FLOOR_Y, -20]} renderOrder={0} material={material}>
        <planeGeometry args={[90, 50]} />
      </mesh>
      {/* Stands on the floor's far edge (z = -45). */}
      <mesh ref={wall} position={[0, FLOOR_Y + 5, -45]} renderOrder={1} material={glow}>
        <planeGeometry args={[90, 10]} />
      </mesh>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Watermark                                                        */
/* ------------------------------------------------------------------ */

/** Rasterises the logo (or the site name in the display face) to a texture: SVGs get a real size, every source the same treatment. */
function useWatermarkTexture(url: string, text: string): THREE.CanvasTexture | null {
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    let cancelled = false;
    let made: THREE.CanvasTexture | null = null;

    const finish = (canvas: HTMLCanvasElement) => {
      if (cancelled) return;
      made = new THREE.CanvasTexture(canvas);
      made.colorSpace = THREE.SRGBColorSpace;
      made.generateMipmaps = false;
      made.minFilter = THREE.LinearFilter;
      setTex(made);
    };

    const fromText = async () => {
      await document.fonts?.ready;
      const probe = document.createElement("span");
      probe.className = "type-display";
      probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none";
      document.body.appendChild(probe);
      const cs = getComputedStyle(probe);
      const family = cs.fontFamily || "sans-serif";
      const weight = cs.fontWeight || "800";
      probe.remove();
      const size = 280;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.font = `${weight} ${size}px ${family}`;
      const w = Math.ceil(ctx.measureText(text).width) + size * 0.4;
      canvas.width = Math.min(4096, w);
      canvas.height = Math.round(size * 1.3);
      ctx.font = `${weight} ${size}px ${family}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.fillText(text, canvas.width / 2, canvas.height / 2 + size * 0.04);
      finish(canvas);
    };

    const fromImage = async () => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.src = sameOriginMedia(url);
      await img.decode();
      const natW = img.naturalWidth || 1024;
      const natH = img.naturalHeight || 512;
      const scale = Math.min(2048 / natW, 1024 / natH, 4);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(natW * scale));
      canvas.height = Math.max(1, Math.round(natH * scale));
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      finish(canvas);
    };

    (url ? fromImage() : fromText()).catch((err) => {
      console.warn("[genesis] watermark failed to load — falling back to the name", err);
      if (url) void fromText();
    });

    return () => {
      cancelled = true;
      made?.dispose();
    };
  }, [url, text]);

  return tex;
}

type MarkProps = {
  url: string;
  text: string;
  glitch: number;
  opacity: number;
  scale: number;
  colors: PaletteUniforms;
  clock: RefObject<Clock>;
};

function Watermark({ url, text, glitch, opacity, scale, colors, clock }: MarkProps) {
  const texture = useWatermarkTexture(url, text);
  const mesh = useRef<ShaderMesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: screenVertex,
        fragmentShader: watermarkFragment,
        uniforms: {
          uTex: { value: null },
          uRes: { value: new THREE.Vector2(1, 1) },
          uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
          uTime: { value: 0 },
          uGlitch: { value: 0 },
          uOpacity: { value: 0 },
          uGlow: colors.uGlow,
          uAccent: colors.uAccent,
        },
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [colors],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state, delta) => {
    const u = mesh.current?.material.uniforms;
    if (!u || !texture) return;
    u.uTex.value = texture;
    const img = texture.image as HTMLCanvasElement;
    const dpr = state.viewport.dpr;
    const W = state.size.width;
    const H = state.size.height;
    const aspect = img.width / img.height;
    let w = W * scale;
    let h = w / aspect;
    if (h > H * MARK_MAX_H) {
      h = H * MARK_MAX_H;
      w = h * aspect;
    }
    const x = (W - w) / 2;
    const yFromBottom = H - H * MARK_Y - h / 2;
    (u.uRect.value as THREE.Vector4).set(x * dpr, yFromBottom * dpr, w * dpr, h * dpr);
    (u.uRes.value as THREE.Vector2).set(W * dpr, H * dpr);
    u.uTime.value = clock.current.t;
    u.uGlitch.value = clock.current.frozen ? 0 : glitch;
    // Fades in once the texture lands, eases on admin changes.
    u.uOpacity.value += (opacity - u.uOpacity.value) * ease(2.5, delta);
  });

  if (!texture) return null;
  return (
    <mesh ref={mesh} frustumCulled={false} renderOrder={5} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Stage                                                               */
/* ------------------------------------------------------------------ */

type SceneProps = {
  preset: GenesisBackground;
  palette: GenesisPalette;
  grid: boolean;
  watermark: { url: string; text: string; glitch: number; opacity: number; scale: number };
  pointer: RefObject<Pointer>;
  reducedMotion: boolean;
  /** Pauses rendering entirely while the hero is off-screen. */
  active: boolean;
  onReady: () => void;
};

function Stage({ preset, palette, grid, watermark, pointer, reducedMotion, onReady }: Omit<SceneProps, "active">) {
  const colors = usePaletteUniforms(palette);
  const clock = useRef<Clock>({ t: reducedMotion ? FROZEN_T : 0, age: 0, frozen: reducedMotion });
  const ready = useRef(false);

  // Priority -1: the shared clock ticks before every material reads it (negative keeps auto-render on).
  useFrame((_, delta) => {
    const c = clock.current;
    c.age += Math.min(delta, 0.1);
    c.frozen = reducedMotion;
    if (reducedMotion) c.t = FROZEN_T;
    else c.t += Math.min(delta, 0.1);
  }, -1);

  useFrame(() => {
    if (ready.current) return;
    ready.current = true;
    onReady();
  });

  return (
    <>
      <Backdrop preset={preset} colors={colors} clock={clock} pointer={pointer} />
      {grid && <Grid colors={colors} clock={clock} />}
      <Watermark {...watermark} colors={colors} clock={clock} />
    </>
  );
}

export default function GenesisScene({ active, ...props }: SceneProps) {
  const coarse = useMemo(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches, []);
  const [dpr, setDpr] = useState(coarse ? 1 : 1.5);
  return (
    <Canvas
      camera={{ position: [0, 0.25, 6], fov: 40, near: 0.1, far: 80 }}
      dpr={dpr}
      gl={{ antialias: false, powerPreference: "high-performance", alpha: false }}
      frameloop={active ? "always" : "never"}
      onCreated={({ camera }) => camera.lookAt(0, 0.05, 0)}
      aria-hidden
    >
      {/* Sustained low fps → render at 1× for the session (the shaders scale with pixel count). */}
      <PerformanceMonitor onDecline={() => setDpr(1)} />
      <Stage {...props} />
    </Canvas>
  );
}
