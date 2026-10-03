"use client";

import { PerformanceMonitor, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, ChromaticAberration, EffectComposer } from "@react-three/postprocessing";
import { easing } from "maath";
import type { BloomEffect, ChromaticAberrationEffect } from "postprocessing";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import type { HeroConfig, HeroFeatures } from "@/data/hero-config";
import { heroSignals } from "@/lib/hero-signals";

/* ------------------------------------------------------------------ */
/* Tunables                                                            */
/* ------------------------------------------------------------------ */
const CAMERA = { y: 0.2, z: 6, pitch: -0.05, fov: 35 };
/**
 * Pointer parallax: how far the camera travels / turns at the screen edge.
 * yaw ≈ atan(x / z) + a little, so the camera arcs AROUND the head; a full
 * π/7 overshoots and throws the subject to the screen edge.
 */
const PARALLAX = { x: 1.2, y: 0.5, yaw: Math.PI / 14, pitch: 0.04 };
/** maath smoothTime (s) — LOWER is snappier. */
const DAMP_POS = 0.15;
const DAMP_ROT = 0.12;
/** Scroll (in viewport heights) over which the camera dollies in. */
const DOLLY = 1.2;
/** Camera shake: per-frame pointer travel (NDC @ 60fps) that triggers it, size, decay. */
const SHAKE = { trigger: 0.3, amount: 0.04, ms: 200 };

const FLOOR_Y = -1.4;
const SILHOUETTE = { size: 3.6, y: -0.45 };
/** Head lean toward the pointer; roll follows pointer.y (tilts when looking up / down). */
const LEAN = { yaw: 0.08, pitch: 0.05, x: 0.15, y: 0.1, roll: -0.02 };

/**
 * Pose ladder: 7 horizontal poses centred on pointer.x = -0.75 … +0.75 (0.25
 * apart; beyond ±0.75 holds the extreme). Within each step the crossfade is
 * eased with a hold at both ends, so a resting pointer shows ONE clean pose.
 */
const LADDER = { first: -0.75, step: 0.25, hold: 0.32 };
/** Up / down take over past |pointer.y| = 0.4, fully in by 0.85 — only near the centre column. */
const VERTICAL = { start: 0.4, full: 0.85, reach: 1 };
/** Pose crossfade smoothTime — settles in ~200ms. */
const POSE_DAMP = 0.06;
/** Max poses sampled per pixel; the heaviest N win each frame. */
const SLOTS = 4;
/** Frame-loop keys for the 9 pose weights: ladder 0–6, then up, down. */
const POSE_KEYS = ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "up", "down"] as const;

/** Glitch: one horizontal jolt of 2–3px for 80ms every 8–12s. */
const GLITCH = { minGap: 8, maxGap: 12, ms: 80, minPx: 2, maxPx: 3 };
/** Chromatic aberration: base offset (at strength 0.5), pointer-speed multiplier, idle breathing, hard cap. */
const CA = { x: 0.0028, y: 0.0016, spike: 18, breathe: 0.25, period: 4, max: 0.012 };
/** Bloom intensity at strength 1 (0.5 → the original 1.6). */
const BLOOM_MAX = 3.2;

/**
 * Parallax layers drift opposite the pointer by `rate` × strength; `depth`
 * is the layer's rough distance from the camera, so equal rates read as
 * equal on-screen travel. The silhouette (layer 3's anchor) never drifts.
 */
const LAYERS = {
  back: { rate: 0.2, depth: 56 },
  mid: { rate: 0.5, depth: 44 },
  front: { rate: 1, depth: 12 },
} as const;
const LAYER_TRAVEL = 0.05;

// Brand colours, converted to the linear working space by THREE.Color.
const LIME = new THREE.Color("#e7fe55");
const RED = new THREE.Color("#ff2d2d");
const ORANGE = new THREE.Color("#ff6a1f");

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */
const worldVertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/** Y2K floor: anti-aliased lines scrolling toward the camera, lime → red at the horizon. */
const gridFragment = /* glsl */ `
  uniform float uTime;
  uniform float uIntro;
  uniform vec3 uNear;
  uniform vec3 uFar;
  varying vec3 vWorld;

  // 0..1 line coverage for a unit grid, width in screen pixels.
  float gridLines(vec2 p, float px) {
    vec2 w = fwidth(p) * px;
    vec2 g = abs(fract(p - 0.5) - 0.5) / max(w, 1e-4);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }

  void main() {
    vec2 p = vWorld.xz * vec2(1.0, 0.8);
    p.y += uTime * 0.6;

    float core = gridLines(p, 1.2);
    float halo = gridLines(p, 7.0);

    float dist = length(vWorld.xz - cameraPosition.xz);
    float fade = smoothstep(42.0, 6.0, dist);           // dissolve into the horizon
    float near = smoothstep(3.5, 14.0, dist);           // and clear of the copy up front
    float horizon = smoothstep(10.0, 34.0, dist);

    vec3 col = mix(uNear, uFar, horizon);
    // Core lines push past 1.0 so Bloom picks them up; the halo stays under.
    vec3 c = col * (core * 1.5 + halo * 0.1) * fade * mix(0.03, 1.0, near) * uIntro;
    gl_FragColor = vec4(c, 1.0);
  }
`;

/** Layer 2 — horizon haze + a striped Y2K sun, positioned by view elevation. Additive over layer 1. */
const skyFragment = /* glsl */ `
  uniform float uTime;
  uniform float uIntro;
  uniform vec3 uSun;
  uniform vec3 uHaze;
  varying vec3 vWorld;

  void main() {
    vec3 d = vWorld - cameraPosition;
    float elev = atan(d.y, -d.z);                 // 0 at eye level
    float az = atan(d.x, -d.z);

    float haze = exp(-abs(elev - 0.01) * 38.0);
    vec3 c = uHaze * haze * 0.3;

    // Sun: a disk above the horizon with scanline cuts that thicken toward its base.
    vec2 s = vec2(az, elev - 0.1) / 0.11;
    float r = length(s);
    float disk = smoothstep(1.0, 0.985, r);
    float band = fract(s.y * 4.5 + uTime * 0.12);
    float cut = step(band, mix(0.55, 0.0, smoothstep(-1.0, 0.2, s.y)));
    float sun = disk * (1.0 - cut);
    c += uSun * sun * mix(0.12, 0.42, smoothstep(-1.0, 1.0, s.y));
    c += uSun * exp(-max(r - 1.0, 0.0) * 6.0) * 0.05;  // soft corona

    gl_FragColor = vec4(c * uIntro, 1.0);
  }
`;

/** Layer 1 — a faint ambient wash: warm at the horizon, cooling to near-black overhead, slowly breathing. */
const ambientFragment = /* glsl */ `
  uniform float uTime;
  uniform float uIntro;
  uniform vec3 uWarm;
  uniform vec3 uCool;
  varying vec2 vUv;

  void main() {
    float h = vUv.y;
    float warm = exp(-pow((h - 0.38) * 5.0, 2.0));
    float cool = smoothstep(0.45, 1.0, h);
    float breathe = 0.85 + 0.15 * sin(uTime * 0.35);
    vec3 c = (uWarm * warm * 0.05 + uCool * cool * 0.025) * breathe;
    gl_FragColor = vec4(c * uIntro, 1.0);
  }
`;

const starVertex = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vTwinkle;
  varying float vHorizon;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vTwinkle = 0.55 + 0.45 * sin(uTime * (0.6 + aPhase) + aPhase * 40.0);
    vHorizon = smoothstep(1.0, 6.0, position.y);      // thin out into the haze
    gl_PointSize = aSize * uPixelRatio * (60.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const starFragment = /* glsl */ `
  uniform float uIntro;
  uniform vec3 uColor;
  varying float vTwinkle;
  varying float vHorizon;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(uColor * a * vTwinkle * vHorizon * uIntro, 1.0);
  }
`;

/**
 * Silhouette sprite: up to four head poses blended by weight (premultiplied,
 * so transparent texels don't bleed colour), then a rim light derived from
 * the BLENDED alpha — sample a ring of neighbours; where the centre is opaque
 * but neighbours are clear we are on an edge, and the clear side gives the
 * 2D outward normal. One rim, even mid-crossfade. Radii are in UV units so
 * the rim is the same width on every texture size.
 */
const RIM_DIRS = 12;
const silhouetteFragment = /* glsl */ `
  uniform sampler2D uT0;
  uniform sampler2D uT1;
  uniform sampler2D uT2;
  uniform sampler2D uT3;
  uniform vec4 uW;           // slot weights (sum 1)
  uniform vec2 uLight;       // 2D light direction, unit
  uniform float uIntro;
  uniform float uHue;        // -1 lime bias … +1 red-orange bias
  uniform float uBoost;      // rim flash on fast pointer moves / logo hover
  uniform float uGlitch;     // horizontal UV jolt
  uniform vec3 uTint;        // reactive lighting: blended pose tint
  uniform float uTintAmt;
  uniform vec3 uLime;
  uniform vec3 uOrange;
  uniform vec3 uRed;
  varying vec2 vUv;

  const int DIRS = ${RIM_DIRS};
  const float TAU = 6.2831853;
  const float R1 = ${(6 / 1600).toFixed(5)};
  const float R2 = ${(18 / 1600).toFixed(5)};

  // Weights are uniform, so these branches are coherent and skip idle slots.
  float alphaAt(vec2 uv) {
    float a = 0.0;
    if (uW.x > 0.002) a += uW.x * texture2D(uT0, uv).a;
    if (uW.y > 0.002) a += uW.y * texture2D(uT1, uv).a;
    if (uW.z > 0.002) a += uW.z * texture2D(uT2, uv).a;
    if (uW.w > 0.002) a += uW.w * texture2D(uT3, uv).a;
    return a;
  }

  vec4 premulAt(vec2 uv) {
    vec4 c = vec4(0.0);
    vec4 t;
    if (uW.x > 0.002) { t = texture2D(uT0, uv); c += uW.x * vec4(t.rgb * t.a, t.a); }
    if (uW.y > 0.002) { t = texture2D(uT1, uv); c += uW.y * vec4(t.rgb * t.a, t.a); }
    if (uW.z > 0.002) { t = texture2D(uT2, uv); c += uW.z * vec4(t.rgb * t.a, t.a); }
    if (uW.w > 0.002) { t = texture2D(uT3, uv); c += uW.w * vec4(t.rgb * t.a, t.a); }
    return c;
  }

  void main() {
    vec2 uv = vUv + vec2(uGlitch, 0.0);
    vec4 pm = premulAt(uv);
    if (pm.a < 0.01) discard;
    vec3 color = pm.rgb / pm.a;

    float clear = 0.0;
    vec2 outward = vec2(0.0);
    for (int i = 0; i < DIRS; i++) {
      float a = TAU * float(i) / float(DIRS);
      vec2 dir = vec2(cos(a), sin(a));
      // Two radii: a crisp inner line plus a softer, wider falloff. Measured as the
      // alpha DROP toward each neighbour (relative to here), so the inside of a
      // partly-faded pose — uniformly translucent — never reads as an edge.
      float n1 = max(0.0, pm.a - alphaAt(uv + dir * R1)) / pm.a;
      float n2 = max(0.0, pm.a - alphaAt(uv + dir * R2)) / pm.a;
      float w = n1 * 0.65 + n2 * 0.35;
      clear += w;
      outward += dir * w;
    }
    clear /= float(DIRS);
    // Fading poses' own outlines stay dim: the rim needs a mostly-opaque blend.
    float edge = pm.a * smoothstep(0.3, 0.75, pm.a) * smoothstep(0.02, 0.45, clear);
    vec2 normal = length(outward) > 1e-4 ? normalize(outward) : vec2(0.0, 1.0);
    float facing = dot(normal, uLight) * 0.5 + 0.5;

    // Lit side shifts lime → red-orange with the pointer; the shadow side takes the other.
    // Reactive lighting pulls the lit side toward the current pose's tint.
    float h = smoothstep(-1.0, 1.0, uHue);
    vec3 lit = mix(mix(uLime, uOrange, h), uTint, uTintAmt);
    vec3 shade = mix(uRed, uLime, h);
    vec3 rim = mix(shade * 1.2, lit * 5.2, smoothstep(0.35, 0.9, facing));
    float rimAmt = edge * mix(0.25, 1.0, facing) * uIntro * uBoost;

    vec3 base = color * 0.82;
    // Fade the cropped bottom edge into the floor.
    float floorFade = smoothstep(0.0, 0.16, vUv.y);
    gl_FragColor = vec4(base + rim * rimAmt, pm.a * floorFade);
  }
`;

/* ------------------------------------------------------------------ */
/* Shared pointer (window-level — the hero copy sits above the canvas)  */
/* ------------------------------------------------------------------ */
/** `impulse` / `at` encode recent pointer speed; read it through pointerSpeed(). */
type Pointer = { x: number; y: number; impulse: number; at: number };

/** 0..1, decays ~exponentially after the pointer stops. */
const pointerSpeed = (p: Pointer) => p.impulse * Math.exp(-(performance.now() - p.at) / 450);

function usePointer() {
  const ref = useRef<Pointer>({ x: 0, y: 0, impulse: 0, at: 0 });
  useEffect(() => {
    let lastX = 0;
    let lastY = 0;
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -((e.clientY / window.innerHeight) * 2 - 1);
      ref.current.impulse = Math.min(1, pointerSpeed(ref.current) + Math.hypot(x - lastX, y - lastY) * 4);
      ref.current.at = performance.now();
      ref.current.x = x;
      ref.current.y = y;
      lastX = x;
      lastY = y;
    };
    const onLeave = () => {
      ref.current.x = 0;
      ref.current.y = 0;
    };
    window.addEventListener("mousemove", onMove);
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, []);
  return ref;
}

/**
 * Rim energy the silhouette writes each frame and Bloom follows (reactive
 * lighting). Frame-loop state, never read during render.
 */
const light = { energy: 0 };

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Target weight per pose: indices 0–6 are the ladder, 7 = up, 8 = down.
 * At most three are non-zero: two neighbouring ladder poses + up OR down.
 */
function poseTargets(x: number, y: number, out: number[]) {
  out.fill(0);
  const last = 6;
  const pos = Math.min(last, Math.max(0, (x - LADDER.first) / LADDER.step));
  const i = Math.min(last - 1, Math.floor(pos));
  const f = smooth(LADDER.hold, 1 - LADDER.hold, pos - i);

  // Up / down only blend in near the centre column (the poses face forward).
  const centre = 1 - clamp01(Math.abs(pos - 3) / VERTICAL.reach);
  const v = smooth(VERTICAL.start, VERTICAL.full, Math.abs(y)) * centre;

  out[i] = (1 - f) * (1 - v);
  out[i + 1] = f * (1 - v);
  out[y > 0 ? 7 : 8] = v;
}

/* ------------------------------------------------------------------ */
/* Scene pieces                                                        */
/* ------------------------------------------------------------------ */

/** A group that drifts opposite the pointer — one parallax layer. */
function ParallaxLayer({
  pointer,
  rate,
  depth,
  strength,
  children,
}: {
  pointer: RefObject<Pointer>;
  rate: number;
  depth: number;
  strength: number;
  children: ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const p = pointer.current;
    const k = rate * strength * depth * LAYER_TRAVEL;
    easing.damp3(g.position, [-p.x * k, -p.y * k * 0.5, 0], 0.35, delta);
  });
  return <group ref={group}>{children}</group>;
}

function Ambient() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: worldVertex,
        fragmentShader: ambientFragment,
        uniforms: {
          uTime: { value: 0 },
          uIntro: { value: 0 },
          uWarm: { value: RED.clone().lerp(ORANGE, 0.3) },
          uCool: { value: new THREE.Color("#2a2f6b") },
        },
        toneMapped: false,
        depthWrite: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  const mesh = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>>(null);

  useFrame((state) => {
    const u = mesh.current?.material.uniforms;
    if (!u) return;
    const t = state.clock.elapsedTime;
    u.uTime.value = t;
    u.uIntro.value = easeOut(t / 2.5);
  });

  return (
    <mesh ref={mesh} position={[0, 6, -60]} material={material} renderOrder={-3}>
      <planeGeometry args={[220, 90]} />
    </mesh>
  );
}

const STAR_COUNT = 650;

function Stars() {
  const pixelRatio = useThree((s) => s.viewport.dpr);
  const geometry = useMemo(() => {
    // Deterministic scatter (no Math.random during render): a cheap hash.
    const rand = (n: number) => {
      const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return s - Math.floor(s);
    };
    const pos = new Float32Array(STAR_COUNT * 3);
    const size = new Float32Array(STAR_COUNT);
    const phase = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      pos[i * 3] = (rand(i) - 0.5) * 150;
      pos[i * 3 + 1] = 0.5 + Math.pow(rand(i + 1000), 0.7) * 30;
      pos[i * 3 + 2] = -50 - rand(i + 2000) * 8;
      size[i] = 0.6 + Math.pow(rand(i + 3000), 6) * 2.6;
      phase[i] = rand(i + 4000);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    return g;
  }, []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: starVertex,
        fragmentShader: starFragment,
        uniforms: {
          uTime: { value: 0 },
          uIntro: { value: 0 },
          uPixelRatio: { value: 1 },
          uColor: { value: new THREE.Color("#fff6e0") },
        },
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const points = useRef<THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>>(null);

  useFrame((state) => {
    const u = points.current?.material.uniforms;
    if (!u) return;
    const t = state.clock.elapsedTime;
    u.uTime.value = t;
    u.uIntro.value = easeOut((t - 0.4) / 2.5) * 0.9;
    u.uPixelRatio.value = pixelRatio;
  });

  return <points ref={points} geometry={geometry} material={material} renderOrder={-2} />;
}

function Floor() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: worldVertex,
        fragmentShader: gridFragment,
        uniforms: {
          uTime: { value: 0 },
          uIntro: { value: 0 },
          uNear: { value: LIME.clone() },
          uFar: { value: RED.clone() },
        },
        // Additive: where the grid fades to black it adds nothing, so the
        // horizon haze behind it shows through instead of a hard dark band.
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  const mesh = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>>(null);

  useFrame((state) => {
    const u = mesh.current?.material.uniforms;
    if (!u) return;
    const t = state.clock.elapsedTime;
    u.uTime.value = t;
    u.uIntro.value = easeOut((t - 0.2) / 1.6);
  });

  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} position={[0, FLOOR_Y, -20]} material={material}>
      <planeGeometry args={[90, 50]} />
    </mesh>
  );
}

function Sky() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: worldVertex,
        fragmentShader: skyFragment,
        uniforms: {
          uTime: { value: 0 },
          uIntro: { value: 0 },
          uSun: { value: RED.clone() },
          uHaze: { value: RED.clone().lerp(LIME, 0.25) },
        },
        // Additive so layer 1 (ambient wash + stars) shows through the empty sky.
        blending: THREE.AdditiveBlending,
        transparent: true,
        toneMapped: false,
        depthWrite: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  const mesh = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>>(null);

  useFrame((state) => {
    const u = mesh.current?.material.uniforms;
    if (!u) return;
    const t = state.clock.elapsedTime;
    u.uTime.value = t;
    u.uIntro.value = easeOut(t / 2);
  });

  return (
    <mesh ref={mesh} position={[0, 4, -42]} material={material} renderOrder={-1}>
      <planeGeometry args={[160, 60]} />
    </mesh>
  );
}

type SilhouetteProps = {
  pointer: RefObject<Pointer>;
  poses: HeroConfig["poses"];
  features: HeroFeatures;
  reducedMotion: boolean;
};

function Silhouette({ pointer, poses, features, reducedMotion }: SilhouetteProps) {
  const gl = useThree((s) => s.gl);
  // Order: ladder (7, left → right), then up, then down — the indices poseTargets() writes.
  const all = useMemo(() => [...poses.ladder, poses.up, poses.down], [poses]);
  const textures = useTexture(
    all.map((p) => p.src),
    (loaded) => {
      for (const t of loaded) {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
      }
    },
  );
  const tints = useMemo(() => all.map((p) => new THREE.Color(p.tint)), [all]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: worldVertex,
        fragmentShader: silhouetteFragment,
        uniforms: {
          uT0: { value: textures[3] },
          uT1: { value: textures[3] },
          uT2: { value: textures[3] },
          uT3: { value: textures[3] },
          uW: { value: new THREE.Vector4(1, 0, 0, 0) },
          uLight: { value: new THREE.Vector2(0, 1) },
          uIntro: { value: 0 },
          uHue: { value: 0 },
          uBoost: { value: 1 },
          uGlitch: { value: 0 },
          uTint: { value: new THREE.Color(1, 1, 1) },
          uTintAmt: { value: 0 },
          uLime: { value: LIME.clone() },
          uOrange: { value: ORANGE.clone() },
          uRed: { value: RED.clone() },
        },
        transparent: true,
        // Always over the floor: the plane's lower half sits "below" it.
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    [textures],
  );
  useEffect(() => () => material.dispose(), [material]);

  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>>(null);
  // Per-frame scratch + timers live in one ref so the frame loop can mutate them.
  const st = useRef({
    light: new THREE.Vector2(0, 1),
    lightTarget: new THREE.Vector2(),
    target: new Array<number>(POSE_KEYS.length).fill(0),
    // Keyed (not an array) so maath can keep a velocity per pose; index 3 = centre.
    weights: Object.fromEntries(POSE_KEYS.map((k, i) => [k, i === 3 ? 1 : 0])) as Record<string, number>,
    order: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    tint: new THREE.Color(),
    hue: { v: 0 },
    tintAmt: { v: 0 },
    hover: { v: 0 },
    flashAt: -Infinity,
    nextGlitch: -1, // scheduled on the first frame (no randomness during render)
    glitchUntil: 0,
    glitchPx: 0,
  });

  useFrame((state, delta) => {
    const g = group.current;
    const u = mesh.current?.material.uniforms;
    if (!g || !u) return;
    const p = pointer.current;
    const s = st.current;
    const t = state.clock.elapsedTime;

    // Pose weights: damp each toward its target, then bind the heaviest SLOTS.
    poseTargets(p.x, p.y, s.target);
    const wt = s.weights;
    for (let i = 0; i < POSE_KEYS.length; i++) easing.damp(wt, POSE_KEYS[i], s.target[i], POSE_DAMP, delta);
    s.order.sort((a, b) => wt[POSE_KEYS[b]] - wt[POSE_KEYS[a]]);
    let sum = 0;
    for (let k = 0; k < SLOTS; k++) sum += Math.max(0, wt[POSE_KEYS[s.order[k]]]);
    sum = sum || 1;
    const slots = [u.uT0, u.uT1, u.uT2, u.uT3];
    const w = u.uW.value as THREE.Vector4;
    for (let k = 0; k < SLOTS; k++) {
      const idx = s.order[k];
      slots[k].value = textures[idx];
      w.setComponent(k, Math.max(0, wt[POSE_KEYS[idx]]) / sum);
    }

    // Reactive lighting: blended pose tint, stronger the further the head turns.
    s.tint.setRGB(0, 0, 0);
    for (let i = 0; i < POSE_KEYS.length; i++) {
      const wi = Math.max(0, wt[POSE_KEYS[i]]);
      s.tint.r += tints[i].r * wi;
      s.tint.g += tints[i].g * wi;
      s.tint.b += tints[i].b * wi;
    }
    (u.uTint.value as THREE.Color).copy(s.tint);
    const turn = clamp01(Math.max(Math.abs(p.x) * 1.15, wt[POSE_KEYS[7]] + wt[POSE_KEYS[8]]));
    easing.damp(s.tintAmt, "v", features.reactiveLighting ? turn * 0.85 : 0, 0.3, delta);
    u.uTintAmt.value = s.tintAmt.v;

    // Lean into the pointer: small turn + shift on the whole head, a touch of roll with y.
    easing.dampE(g.rotation, [-p.y * LEAN.pitch, p.x * LEAN.yaw, p.y * LEAN.roll], 0.15, delta);
    easing.damp3(g.position, [p.x * LEAN.x, SILHOUETTE.y + p.y * LEAN.y, 0], 0.15, delta);

    // Light swings toward the pointer, always coming from somewhere above.
    s.lightTarget.set(p.x, 0.55 + p.y * 0.45).normalize();
    easing.damp2(s.light, s.lightTarget, 0.4, delta);
    u.uLight.value.copy(s.light).normalize();

    easing.damp(s.hue, "v", p.x, 0.25, delta);
    u.uHue.value = s.hue.v;

    // Rim flash: fast pointer or a logo click → brighter for 200ms; logo hover → brighter while held.
    const now = performance.now();
    if (pointerSpeed(p) > 0.5) s.flashAt = now;
    if (heroSignals.pulseAt > s.flashAt) s.flashAt = heroSignals.pulseAt;
    const flash = Math.max(0, 1 - (now - s.flashAt) / 200);
    easing.damp(s.hover, "v", heroSignals.hover > 0 ? 1 : 0, 0.2, delta);
    u.uBoost.value = 1 + 0.8 * flash + 0.5 * s.hover.v;

    u.uIntro.value = easeOut((t - 0.5) / 1.8);
    light.energy = features.reactiveLighting ? s.tintAmt.v * 0.6 + s.hover.v * 0.5 + flash * 0.4 : 0;

    // Glitch: a short horizontal jolt, measured in screen pixels.
    if (s.nextGlitch < 0) s.nextGlitch = t + GLITCH.minGap + Math.random() * (GLITCH.maxGap - GLITCH.minGap);
    if (features.glitch && !reducedMotion && t >= s.nextGlitch) {
      s.glitchUntil = t + GLITCH.ms / 1000;
      s.glitchPx = (Math.random() < 0.5 ? -1 : 1) * (GLITCH.minPx + Math.random() * (GLITCH.maxPx - GLITCH.minPx));
      s.nextGlitch = t + GLITCH.minGap + Math.random() * (GLITCH.maxGap - GLITCH.minGap);
    }
    if (t < s.glitchUntil) {
      const cam = state.camera as THREE.PerspectiveCamera;
      const dist = Math.max(0.1, cam.position.z - g.position.z);
      const viewH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
      const planePx = (SILHOUETTE.size / viewH) * state.size.height;
      u.uGlitch.value = s.glitchPx / planePx;
    } else {
      u.uGlitch.value = 0;
    }
  });

  return (
    <group ref={group} position={[0, SILHOUETTE.y, 0]}>
      <mesh ref={mesh} material={material} renderOrder={2}>
        <planeGeometry args={[SILHOUETTE.size, SILHOUETTE.size]} />
      </mesh>
    </group>
  );
}

/**
 * Pointer parallax on position (damp3) and orientation (dampE), scroll dolly,
 * and a short hand-held shake when the pointer is flicked.
 */
function CameraRig({ pointer, shake }: { pointer: RefObject<Pointer>; shake: boolean }) {
  const st = useRef({
    // YXZ: yaw first, then pitch — no roll, so the horizon stays level.
    euler: new THREE.Euler(CAMERA.pitch, 0, 0, "YXZ"),
    base: new THREE.Vector3(0, CAMERA.y, CAMERA.z),
    last: new THREE.Vector2(),
    shakeAt: -Infinity,
  });

  useFrame((state, delta) => {
    const p = pointer.current;
    const s = st.current;
    const cam = state.camera;
    const scroll = Math.min(1, window.scrollY / window.innerHeight);

    easing.damp3(s.base, [p.x * PARALLAX.x, CAMERA.y + p.y * PARALLAX.y, CAMERA.z - scroll * DOLLY], DAMP_POS, delta);
    // Turn back toward the subject so the parallax reads as an arc around it.
    easing.dampE(s.euler, [CAMERA.pitch - p.y * PARALLAX.pitch, p.x * PARALLAX.yaw, 0], DAMP_ROT, delta);

    // Shake: per-frame pointer travel, normalised to 60fps.
    const now = performance.now();
    const speed = Math.hypot(p.x - s.last.x, p.y - s.last.y) / Math.max(delta * 60, 1e-3);
    s.last.set(p.x, p.y);
    if (shake && speed > SHAKE.trigger) s.shakeAt = now;
    const k = SHAKE.amount * Math.max(0, 1 - (now - s.shakeAt) / SHAKE.ms);

    cam.position.set(s.base.x + (Math.random() * 2 - 1) * k, s.base.y + (Math.random() * 2 - 1) * k, s.base.z);
    cam.rotation.copy(s.euler);
  });
  return null;
}

/** Chromatic aberration that breathes at idle and spikes with pointer speed; Bloom follows the rim energy. */
function Effects({
  pointer,
  features,
  reducedMotion,
}: {
  pointer: RefObject<Pointer>;
  features: HeroFeatures;
  reducedMotion: boolean;
}) {
  const ca = useRef<ChromaticAberrationEffect>(null);
  const bloom = useRef<BloomEffect>(null);
  const caScale = clamp01(features.chromaticAberration) * 2;
  const bloomBase = clamp01(features.bloom) * BLOOM_MAX;
  const initial = useMemo(() => new THREE.Vector2(CA.x * caScale, CA.y * caScale), [caScale]);
  const level = useRef({ v: bloomBase });

  useFrame((state, delta) => {
    const effect = ca.current;
    if (effect) {
      const breathe = reducedMotion ? 1 : 1 + CA.breathe * Math.sin((state.clock.elapsedTime * Math.PI * 2) / CA.period);
      const k = caScale * breathe * (1 + pointerSpeed(pointer.current) * CA.spike);
      easing.damp2(effect.offset, [Math.min(CA.max, CA.x * k), Math.min(CA.max, CA.y * k)], 0.12, delta);
    }
    if (bloom.current) {
      easing.damp(level.current, "v", bloomBase * (1 + 0.35 * light.energy), 0.25, delta);
      bloom.current.intensity = level.current.v;
    }
  });

  return (
    <EffectComposer multisampling={0}>
      <Bloom ref={bloom} mipmapBlur intensity={bloomBase} luminanceThreshold={0.45} luminanceSmoothing={0.2} radius={0.7} />
      <ChromaticAberration ref={ca} offset={initial} radialModulation modulationOffset={0.35} />
    </EffectComposer>
  );
}

/** Tells the page the first textured frame is on screen, so the fallback can fade. */
function Ready({ onReady }: { onReady: () => void }) {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    onReady();
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* Canvas                                                              */
/* ------------------------------------------------------------------ */
type Props = { config: HeroConfig; onReady?: () => void };

/**
 * Desktop hero backdrop in three parallax layers — (1) stars + ambient wash,
 * (2) sun + horizon haze, (3) Y2K neon grid — around a rim-lit, 9-pose
 * silhouette, with Bloom and Chromatic Aberration. Only mounted for fine
 * pointers with motion allowed — Hero renders a static fallback elsewhere.
 */
export default function HeroScene({ config, onReady }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pointer = usePointer();
  const [inView, setInView] = useState(true);
  const [dpr, setDpr] = useState(1.5);
  // Hero only mounts this with motion allowed; this is a belt-and-braces check
  // for the glitch / breathing should the preference flip mid-session.
  const [reducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const { features, poses } = config;
  const depth = reducedMotion ? 0 : clamp01(features.parallax);

  // Stop the render loop entirely once the hero is off screen.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrapRef} aria-hidden className="pointer-events-none absolute inset-0">
      <Canvas
        dpr={dpr}
        frameloop={inView ? "always" : "never"}
        camera={{ fov: CAMERA.fov, position: [0, CAMERA.y, CAMERA.z], rotation: [CAMERA.pitch, 0, 0], near: 0.1, far: 120 }}
        gl={{ antialias: false, alpha: false, powerPreference: "high-performance", stencil: false }}
        style={{ pointerEvents: "none" }}
      >
        <color attach="background" args={["#0a0a0a"]} />
        {/* Halve the resolution on a struggling GPU instead of dropping frames. */}
        <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
        <ParallaxLayer pointer={pointer} strength={depth} {...LAYERS.back}>
          <Ambient />
          <Stars />
        </ParallaxLayer>
        <ParallaxLayer pointer={pointer} strength={depth} {...LAYERS.mid}>
          <Sky />
        </ParallaxLayer>
        <ParallaxLayer pointer={pointer} strength={depth} {...LAYERS.front}>
          <Floor />
        </ParallaxLayer>
        <Suspense fallback={null}>
          <Silhouette pointer={pointer} poses={poses} features={features} reducedMotion={reducedMotion} />
          {onReady && <Ready onReady={onReady} />}
        </Suspense>
        <CameraRig pointer={pointer} shake={features.cameraShake && !reducedMotion} />
        <Effects pointer={pointer} features={features} reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  );
}
