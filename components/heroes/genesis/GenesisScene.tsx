"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import type { GenesisBackground, GenesisPalette } from "@/data/hero-config";
import { sameOriginMedia } from "@/lib/media-url";
import { heroSpin } from "@/store/heroStore";
import { BACKGROUND_FRAGMENTS, gridFragment, hologramFragment, hologramVertex, horizonFragment, horizonVertex, screenVertex, watermarkFragment, worldVertex } from "./shaders";

/**
 * Sprint 15 — the Genesis hero's WebGL layer, behind the 360° portrait (which
 * ImageSequenceHero draws on its own Canvas 2D on top): one canvas, three
 * draws, back to front —
 *   1. a full-screen procedural backdrop (one of four GLSL presets),
 *   2. the retro grid floor in perspective, dissolving into the horizon,
 *   3. the watermark (uploaded logo or the site name) with glitch +
 *      chromatic aberration + neon glow, sitting behind the head,
 *   4. (Sprint 15.5, hologram mode) the 360° head itself, as a tilted plane
 *      through the hologram shader — Fresnel rim, scanlines, RGB split, grain.
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
/** Watermark at 1×: fits this share of the stage (width, height). */
const MARK_BASE = { w: 0.5, h: 0.32 };
/** …and never grows past this, whatever the scale. */
const MARK_MAX = { w: 1.15, h: 0.92 };
/** Hologram plane: the portrait box (as ImageSequenceHero lays it out: top 5%, 86% tall) and its tilt pivot / perspective. */
const PORTRAIT = { top: 0.05, height: 0.86, pivotFromTop: 0.42, perspective: 1100 };
/** webgl skill: cap texture uploads (GPU memory protection). */
const MAX_TEXTURE = 4096;
/**
 * webgl skill: texture memory budget for the pre-uploaded 360° frames (its
 * resource manager caps all textures at 256 MB; this leaves headroom for the
 * rest of the scene). 1254² RGBA ≈ 6.3 MB → ~30 frames resident.
 */
const FRAME_BUDGET_BYTES = 192 * 1024 * 1024;

/** A frame texture configured for the hologram (colour image, no mips, flipped in the shader). */
function frameTexture(image?: TexImageSource): THREE.Texture {
  const t = new THREE.Texture(image as THREE.Texture["image"]);
  t.colorSpace = THREE.SRGBColorSpace; // decoded to linear when sampled (threejs-shaders)
  t.flipY = false; // an ImageBitmap ignores flipY: the shader flips every source the same way
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  if (image) t.needsUpdate = true;
  return t;
}
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
    // 1× fits the logo into half the stage's width and a third of its height; the admin scale (0.5–3) multiplies that.
    let w = Math.min(W * MARK_BASE.w, H * MARK_BASE.h * aspect) * scale;
    let h = w / aspect;
    // Past the stage it would only crop: capped, aspect kept.
    const cap = Math.min(1, (W * MARK_MAX.w) / w, (H * MARK_MAX.h) / h);
    w *= cap;
    h *= cap;
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
/* 4. Hologram head (Sprint 15.5)                                      */
/* ------------------------------------------------------------------ */

export type HologramSettings = { fresnel: number; scanlines: number; aberration: number; grain: number };

/**
 * The 360° frame on screen, drawn as a tilted plane through the hologram
 * shader.
 *
 * Textures: each decoded frame gets its own texture, built when the sequence
 * arrives (props, never inside useFrame) up to FRAME_BUDGET_BYTES, and
 * pre-uploaded to the GPU in idle time with renderer.initTexture — so
 * scrubbing only switches a uniform, never re-uploads 6 MB per frame change.
 * Frames past the budget stream through one shared texture (swap the image,
 * re-upload; a new size disposes the GPU copy first so storage reallocates).
 */
function Hologram({
  settings,
  frames,
  colors,
  clock,
}: {
  settings: HologramSettings;
  frames: readonly (ImageBitmap | HTMLImageElement)[] | null;
  colors: PaletteUniforms;
  clock: RefObject<Clock>;
}) {
  const mesh = useRef<ShaderMesh>(null);
  const seen = useRef({ version: -1, w: 0, h: 0 });
  const gl = useThree((s) => s.gl);
  const texture = useMemo(() => frameTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);

  // Resident textures, one per frame, within the GPU budget.
  const cache = useMemo(() => {
    const map = new Map<ImageBitmap | HTMLImageElement, THREE.Texture>();
    let bytes = 0;
    for (const f of frames ?? []) {
      const size = f.width * f.height * 4;
      if (f.width > MAX_TEXTURE || f.height > MAX_TEXTURE || bytes + size > FRAME_BUDGET_BYTES) break;
      bytes += size;
      map.set(f, frameTexture(f));
    }
    return map;
  }, [frames]);
  // Upload them a few at a time while the browser is idle; free them when the sequence changes.
  useEffect(() => {
    const queue = [...cache.values()];
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 16));
    const cancelIdle = window.cancelIdleCallback ?? window.clearTimeout;
    let handle = 0;
    const step = () => {
      for (let i = 0; i < 2 && queue.length; i++) gl.initTexture(queue.shift()!);
      if (queue.length) handle = idle(step) as number;
    };
    handle = idle(step) as number;
    return () => {
      cancelIdle(handle);
      cache.forEach((t) => t.dispose());
    };
  }, [cache, gl]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: hologramVertex,
        fragmentShader: hologramFragment,
        uniforms: {
          uMap: { value: texture },
          // Not read by the shader: keeps the streaming texture reachable from the frame loop.
          uStream: { value: texture },
          uTexel: { value: new THREE.Vector2(1, 1) },
          uRes: { value: new THREE.Vector2(1, 1) },
          uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
          uPivot: { value: new THREE.Vector2() },
          uTilt: { value: new THREE.Vector2() },
          uShift: { value: new THREE.Vector2() },
          uFocal: { value: PORTRAIT.perspective },
          uTime: { value: 0 },
          uFresnel: { value: 0 },
          uScan: { value: 0 },
          uAberration: { value: 0 },
          uGrain: { value: 0 },
          uOpacity: { value: 0 },
          uGlow: colors.uGlow,
          uTint: colors.uTint,
        },
        // Normal blending: the head occludes the watermark and grid behind it (no CSS occluder needed).
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [texture, colors],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state, delta) => {
    const m = mesh.current;
    if (!m) return;
    const u = m.material.uniforms;
    const frame = heroSpin.frame;
    const s = seen.current;
    if (!frame) {
      m.visible = false;
      return;
    }
    const fw = frame.width;
    const fh = frame.height;
    if (s.version !== heroSpin.version) {
      s.version = heroSpin.version;
      const resident = cache.get(frame);
      if (resident) {
        // Pre-uploaded: switching frames is a uniform swap.
        u.uMap.value = resident;
      } else {
        if (fw > MAX_TEXTURE || fh > MAX_TEXTURE) {
          m.visible = false;
          return;
        }
        // Past the budget: stream through the shared texture (reached via the material, not the memo).
        const tex = u.uStream.value as THREE.Texture;
        if (s.w !== fw || s.h !== fh) tex.dispose(); // a different size needs fresh GPU storage
        tex.image = frame;
        tex.needsUpdate = true;
        u.uMap.value = tex;
        s.w = fw;
        s.h = fh;
      }
    }
    m.visible = true;

    const dpr = state.viewport.dpr;
    const W = state.size.width * dpr;
    const H = state.size.height * dpr;
    // The portrait box (y up), and the frame fitted inside it like the Canvas 2D draws it.
    const boxH = H * PORTRAIT.height;
    const boxY = H * (1 - PORTRAIT.top - PORTRAIT.height);
    const k = Math.min(W / fw, boxH / fh);
    const w = fw * k;
    const h = fh * k;
    (u.uRect.value as THREE.Vector4).set((W - w) / 2, boxY + (boxH - h) / 2, w, h);
    (u.uPivot.value as THREE.Vector2).set(W / 2, boxY + boxH * (1 - PORTRAIT.pivotFromTop));
    (u.uRes.value as THREE.Vector2).set(W, H);
    (u.uTexel.value as THREE.Vector2).set(1 / fw, 1 / fh);
    (u.uTilt.value as THREE.Vector2).set(heroSpin.tiltX, heroSpin.tiltY);
    (u.uShift.value as THREE.Vector2).set(heroSpin.shiftX * dpr, -heroSpin.shiftY * dpr);
    u.uFocal.value = PORTRAIT.perspective * dpr;
    u.uTime.value = clock.current.t;
    u.uFresnel.value = settings.fresnel;
    u.uScan.value = clock.current.frozen ? settings.scanlines * 0.5 : settings.scanlines;
    u.uAberration.value = settings.aberration;
    u.uGrain.value = clock.current.frozen ? 0 : settings.grain;
    u.uOpacity.value += (1 - u.uOpacity.value) * ease(3, delta);
  });

  return (
    <mesh ref={mesh} frustumCulled={false} renderOrder={8} material={material} visible={false}>
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
  /** Sprint 15.5: draw the 360° head through the hologram shader (null → the DOM canvas shows it). */
  hologram: HologramSettings | null;
  /** The decoded 360° frames, for GPU pre-upload (null while there's none or they aren't WebGL-safe). */
  hologramFrames: readonly (ImageBitmap | HTMLImageElement)[] | null;
  pointer: RefObject<Pointer>;
  reducedMotion: boolean;
  /** Pauses rendering entirely while the hero is off-screen. */
  active: boolean;
  onReady: () => void;
  /** webgl skill: the GPU dropped the context — the hero falls back to its CSS stage. */
  onContextLost: () => void;
};

function Stage({ preset, palette, grid, watermark, hologram, hologramFrames, pointer, reducedMotion, onReady }: Omit<SceneProps, "active" | "onContextLost">) {
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
      {hologram && <Hologram settings={hologram} frames={hologramFrames} colors={colors} clock={clock} />}
    </>
  );
}

export default function GenesisScene({ active, onContextLost, ...props }: SceneProps) {
  const coarse = useMemo(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches, []);
  const [dpr, setDpr] = useState(coarse ? 1 : 1.5);
  return (
    <Canvas
      camera={{ position: [0, 0.25, 6], fov: 40, near: 0.1, far: 80 }}
      dpr={dpr}
      gl={{ antialias: false, powerPreference: "high-performance", alpha: false }}
      frameloop={active ? "always" : "never"}
      onCreated={({ camera, gl }) => {
        camera.lookAt(0, 0.05, 0);
        // webgl skill §4.2: never let a lost context crash the page — prevent the default and fall back.
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          console.warn("[genesis] WebGL context lost — showing the CSS stage");
          onContextLost();
        });
      }}
      aria-hidden
    >
      {/* Sustained low fps → render at 1× for the session (the shaders scale with pixel count). */}
      <PerformanceMonitor onDecline={() => setDpr(1)} />
      <Stage {...props} />
    </Canvas>
  );
}
