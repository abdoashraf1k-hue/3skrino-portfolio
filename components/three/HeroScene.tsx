"use client";

import { PerformanceMonitor, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, ChromaticAberration, EffectComposer } from "@react-three/postprocessing";
import { easing } from "maath";
import type { BloomEffect, ChromaticAberrationEffect } from "postprocessing";
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import type { HeroConfig, HeroFeatures } from "@/data/hero-config";
import { alignAll } from "@/lib/hero-align";
import { heroSignals } from "@/lib/hero-signals";
import { FILTER_MODE, GradeEffect, LightRaysEffect, RippleEffect } from "./heroEffects";

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
 * Pose ladder: 7 horizontal poses centred on pointer.x = -0.75 … +0.75, 0.25
 * apart. The target is ONE pose (nearest, with hysteresis so it doesn't
 * chatter on a boundary); the switch is a dithered dissolve, never a blend.
 */
const LADDER = { first: -0.75, step: 0.25, hysteresis: 0.14 };
/**
 * Up / down: the 3D tilt follows |pointer.y| from 0.55 to 1.0; the pose
 * itself swaps at the midpoint (hysteresis ±0.05), and only near the centre
 * column — those poses face forward.
 */
const VERTICAL = { start: 0.55, full: 1, swap: 0.775, hysteresis: 0.05, column: 0.6, tilt: 0.12, rim: 0.7 };
/** Pose dissolve smoothTime — settles in ~200ms. */
const POSE_DAMP = 0.06;
/** Pose-change smear: duration (ms) and length (UV) at full strength. */
const MOTION = { ms: 80, length: 0.007 };
/** Max poses sampled per pixel; the heaviest N win each frame. */
const SLOTS = 4;
/** Frame-loop keys for the 9 pose weights: ladder 0–6, then up, down. */
const POSE_KEYS = ["p0", "p1", "p2", "p3", "p4", "p5", "p6", "up", "down"] as const;
const UP = 7;
const DOWN = 8;
const CENTRE = 3;

/** Glitch: one horizontal jolt of 2–3px for 80ms every 8–12s. */
const GLITCH = { minGap: 8, maxGap: 12, ms: 80, minPx: 2, maxPx: 3 };
/** Chromatic aberration: base offset (at strength 0.5), pointer-speed multiplier, idle breathing, hard cap. */
const CA = { x: 0.0028, y: 0.0016, spike: 18, breathe: 0.25, period: 4, max: 0.012 };
/** Bloom intensity at strength 1 (0.5 → the original 1.6). */
const BLOOM_MAX = 3.2;
/** Cursor ripple: idle time before one fires (and between repeats), lifetime. */
const RIPPLE = { idleMs: 3000, lifeMs: 1600 };
/** Hue drift as the hero scrolls away (radians per viewport). */
const HUE_PER_VH = 0.5;

/**
 * Parallax layers drift opposite the pointer by `rate` × strength; `depth`
 * is the layer's rough distance from the camera, so equal rates read as
 * equal on-screen travel. The silhouette never drifts. The sky (layer 2) is
 * direction-based, so it drifts by angle instead (SKY_DRIFT).
 */
const LAYERS = {
  back: { rate: 0.2, depth: 56 },
  front: { rate: 1, depth: 12 },
} as const;
const LAYER_TRAVEL = 0.05;
/** Layer 2: sun + haze drift, in radians at the screen edge (rate 0.5). */
const SKY_DRIFT = { x: 0.055, y: 0.028 };
/** The sun's resting elevation above the horizon (radians) — shared by the sky shader and the rays. */
const SUN_ELEVATION = 0.1;

// Brand colours, converted to the linear working space by THREE.Color.
const LIME = new THREE.Color("#e7fe55");
const RED = new THREE.Color("#ff2d2d");
const ORANGE = new THREE.Color("#ff6a1f");

/**
 * Frame-loop state shared between scene pieces (there is only ever one hero
 * canvas). Written and read inside useFrame only — never during render.
 */
const shared = {
  /** Rim energy the silhouette writes and Bloom follows (reactive lighting). */
  energy: 0,
  /** 0..1 background softening (depth of field). */
  dof: 0,
  /** Sun centre in screen UV, for the light rays. */
  sun: new THREE.Vector2(0.5, 0.62),
};

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
  uniform float uBlur;     // depth of field: far lines widen + dim
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

    float dist = length(vWorld.xz - cameraPosition.xz);
    float fade = smoothstep(42.0, 6.0, dist);           // dissolve into the horizon
    float near = smoothstep(3.5, 14.0, dist);           // and clear of the copy up front
    float horizon = smoothstep(10.0, 34.0, dist);
    float soft = uBlur * smoothstep(8.0, 24.0, dist);   // only the background softens

    float core = gridLines(p, 1.2 + soft * 3.0);
    float halo = gridLines(p, 7.0 + soft * 6.0);

    vec3 col = mix(uNear, uFar, horizon);
    // Core lines push past 1.0 so Bloom picks them up; the halo stays under.
    vec3 c = col * (core * 1.5 * (1.0 - soft * 0.55) + halo * 0.1) * fade * mix(0.03, 1.0, near) * uIntro;
    gl_FragColor = vec4(c, 1.0);
  }
`;

/** Layer 2 — horizon haze + a striped Y2K sun, positioned by view direction. Additive over layer 1. */
const skyFragment = /* glsl */ `
  uniform float uTime;
  uniform float uIntro;
  uniform float uBlur;     // depth of field: the disk edge and its stripes soften
  uniform vec2 uShift;     // parallax drift (radians)
  uniform vec3 uSun;
  uniform vec3 uHaze;
  varying vec3 vWorld;

  void main() {
    vec3 d = vWorld - cameraPosition;
    float elev = atan(d.y, -d.z) - uShift.y;      // 0 at eye level
    float az = atan(d.x, -d.z) - uShift.x;

    float haze = exp(-abs(elev - 0.01) * mix(38.0, 22.0, uBlur));
    vec3 c = uHaze * haze * 0.3;

    // Sun: a disk above the horizon with scanline cuts that thicken toward its base.
    vec2 s = vec2(az, elev - ${SUN_ELEVATION.toFixed(3)}) / 0.11;
    float r = length(s);
    float disk = smoothstep(1.0, 0.985 - uBlur * 0.22, r);
    float band = fract(s.y * 4.5 + uTime * 0.12);
    float cutW = mix(0.55, 0.0, smoothstep(-1.0, 0.2, s.y));
    float cut = mix(step(band, cutW), smoothstep(cutW + 0.18, cutW - 0.18, band) * 0.6, uBlur);
    float sun = disk * (1.0 - cut);
    c += uSun * sun * mix(0.12, 0.42, smoothstep(-1.0, 1.0, s.y));
    c += uSun * exp(-max(r - 1.0, 0.0) * mix(6.0, 3.5, uBlur)) * 0.05;  // soft corona

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
  uniform float uBlur;
  varying float vTwinkle;
  varying float vHorizon;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vTwinkle = 0.55 + 0.45 * sin(uTime * (0.6 + aPhase) + aPhase * 40.0);
    vHorizon = smoothstep(1.0, 6.0, position.y);      // thin out into the haze
    // Depth of field: out-of-focus stars swell into faint bokeh discs.
    gl_PointSize = aSize * uPixelRatio * (60.0 / -mv.z) * (1.0 + uBlur * 2.4);
    gl_Position = projectionMatrix * mv;
  }
`;

const starFragment = /* glsl */ `
  uniform float uIntro;
  uniform float uBlur;
  uniform vec3 uColor;
  varying float vTwinkle;
  varying float vHorizon;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = mix(smoothstep(0.5, 0.0, d), smoothstep(0.5, 0.3, d) * 0.6, uBlur);
    gl_FragColor = vec4(uColor * a * vTwinkle * vHorizon * uIntro * (1.0 - uBlur * 0.45), 1.0);
  }
`;

/** Embers: rising, swaying sparks; positions are a pure function of seed + time. */
const emberVertex = /* glsl */ `
  attribute vec3 aSeed;     // x, z spread and phase in 0..1
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uZ0;        // depth range of this layer
  uniform float uZ1;
  varying float vLife;
  varying float vHue;
  void main() {
    float speed = 0.12 + aSeed.z * 0.22;
    float life = fract(aSeed.y + uTime * speed / 4.6);
    float y = -1.6 + life * 4.6;
    float x = (aSeed.x - 0.5) * 7.4 + sin(uTime * (0.4 + aSeed.z) + aSeed.y * 31.0) * 0.18;
    float z = mix(uZ0, uZ1, fract(aSeed.x * 7.13 + aSeed.z * 3.7));
    vec4 mv = modelViewMatrix * vec4(x, y, z, 1.0);
    vLife = life;
    vHue = fract(aSeed.z * 5.3);
    gl_PointSize = (1.4 + aSeed.z * 2.6) * uPixelRatio * (6.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const emberFragment = /* glsl */ `
  uniform float uIntensity;
  uniform float uIntro;
  uniform vec3 uA;
  uniform vec3 uB;
  varying float vLife;
  varying float vHue;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.5, 0.0, d);
    float fade = smoothstep(0.0, 0.15, vLife) * smoothstep(1.0, 0.6, vLife);
    vec3 col = mix(uA, uB, vHue);
    gl_FragColor = vec4(col * core * fade * uIntensity * uIntro * 1.6, 1.0);
  }
`;

/** Chromatic fog: a drifting fbm veil in front of the silhouette, tinted by the pointer. */
const fogFragment = /* glsl */ `
  uniform float uTime;
  uniform float uIntro;
  uniform vec2 uPointer;
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 p = vUv * vec2(3.2, 1.6) + vec2(uTime * 0.025, -uTime * 0.012) + uPointer * 0.25;
    float n = fbm(p + fbm(p * 0.6 + uTime * 0.02));
    // Thickest low (a ground fog) and at the sides; thin through the face.
    float low = smoothstep(0.62, 0.0, vUv.y);
    float side = smoothstep(0.18, 0.5, abs(vUv.x - 0.5));
    float density = smoothstep(0.35, 0.85, n) * (low * 0.8 + side * 0.45);
    vec3 tint = mix(uA, uB, clamp(uPointer.x * 0.5 + 0.5, 0.0, 1.0));
    tint = mix(tint, uC, clamp(uPointer.y * 0.5 + 0.25, 0.0, 1.0) * 0.6);
    gl_FragColor = vec4(tint * density * 0.09 * uIntro, 1.0);
  }
`;

/**
 * Silhouette sprite. Up to four poses are bound (the heaviest weights); each
 * pixel picks ONE of them with an 8×8 Bayer threshold that is offset every
 * frame — so a transition is a fine temporal dissolve and a resting pose is
 * one clean image (no alpha blend → no ghost, no double edge). A pose change
 * also smears the previous pose in for 80ms. The rim light comes from the
 * chosen pose's own alpha: sample a ring of neighbours; where the centre is
 * opaque but neighbours are clear we are on an edge, and the clear side
 * gives the 2D outward normal. Radii are in UV units, so the rim is the same
 * width on every texture size.
 */
const RIM_DIRS = 12;
const silhouetteFragment = /* glsl */ `
  uniform sampler2D uT0;
  uniform sampler2D uT1;
  uniform sampler2D uT2;
  uniform sampler2D uT3;
  uniform vec2 uO0;          // per-slot anchor offsets (UV)
  uniform vec2 uO1;
  uniform vec2 uO2;
  uniform vec2 uO3;
  uniform vec4 uW;           // slot weights (sum 1)
  uniform sampler2D uPrev;   // the pose we just left (motion smear)
  uniform vec2 uPrevO;
  uniform float uMotion;     // 1 → 0 over 80ms after a pose change
  uniform float uBlurDir;    // smear direction (±1)
  uniform float uDither;     // per-frame threshold offset
  uniform vec2 uLight;       // 2D light direction, unit
  uniform float uIntro;
  uniform float uHue;        // -1 lime bias … +1 red-orange bias
  uniform float uBoost;      // rim flash on fast pointer moves / logo hover
  uniform float uRimScale;   // up/down poses carry a softer rim
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

  // Ordered dither: classic recursive Bayer, 8×8, in [0, 1).
  float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
  float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

  // Outside the frame (after an anchor offset) is empty, except below it:
  // the bottom edge fades into the floor anyway.
  vec4 inFrame(vec4 t, vec2 uv) {
    return (uv.x < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? vec4(0.0) : t;
  }

  // Pose textures have no mipmaps, so sampling inside a divergent branch is safe.
  vec4 slot(float s, vec2 uv) {
    if (s < 0.5) { vec2 q = uv + uO0; return inFrame(texture2D(uT0, q), q); }
    if (s < 1.5) { vec2 q = uv + uO1; return inFrame(texture2D(uT1, q), q); }
    if (s < 2.5) { vec2 q = uv + uO2; return inFrame(texture2D(uT2, q), q); }
    vec2 q = uv + uO3; return inFrame(texture2D(uT3, q), q);
  }

  vec4 premul(vec4 t) { return vec4(t.rgb * t.a, t.a); }

  void main() {
    vec2 uv = vUv + vec2(uGlitch, 0.0);

    // Which pose does this pixel show this frame?
    float t = fract(bayer8(gl_FragCoord.xy) + uDither);
    float s = 3.0;
    if (t < uW.x) s = 0.0;
    else if (t < uW.x + uW.y) s = 1.0;
    else if (t < uW.x + uW.y + uW.z) s = 2.0;

    vec4 pm = premul(slot(s, uv));
    if (uMotion > 0.01) {
      // 80ms smear: a short horizontal trail of the new pose + the previous one.
      vec4 acc = pm;
      for (int k = 1; k <= 3; k++) {
        acc += premul(slot(s, uv - vec2(uBlurDir * uMotion * ${MOTION.length} * float(k), 0.0)));
      }
      vec2 pq = uv + uPrevO;
      acc += 2.0 * premul(inFrame(texture2D(uPrev, pq), pq));
      pm = mix(pm, acc / 6.0, uMotion);
    }
    if (pm.a < 0.01) discard;
    vec3 color = pm.rgb / pm.a;

    float clear = 0.0;
    vec2 outward = vec2(0.0);
    for (int i = 0; i < DIRS; i++) {
      float a = TAU * float(i) / float(DIRS);
      vec2 dir = vec2(cos(a), sin(a));
      // Two radii: a crisp inner line plus a softer, wider falloff — measured
      // as the alpha DROP toward each neighbour (relative to here).
      float n1 = max(0.0, pm.a - slot(s, uv + dir * R1).a) / pm.a;
      float n2 = max(0.0, pm.a - slot(s, uv + dir * R2).a) / pm.a;
      float w = n1 * 0.65 + n2 * 0.35;
      clear += w;
      outward += dir * w;
    }
    clear /= float(DIRS);
    float edge = pm.a * smoothstep(0.3, 0.75, pm.a) * smoothstep(0.02, 0.45, clear);
    vec2 normal = length(outward) > 1e-4 ? normalize(outward) : vec2(0.0, 1.0);
    float facing = dot(normal, uLight) * 0.5 + 0.5;

    // Lit side shifts lime → red-orange with the pointer; the shadow side takes the other.
    // Reactive lighting pulls the lit side toward the current pose's tint.
    float h = smoothstep(-1.0, 1.0, uHue);
    vec3 lit = mix(mix(uLime, uOrange, h), uTint, uTintAmt);
    vec3 shade = mix(uRed, uLime, h);
    vec3 rim = mix(shade * 1.2, lit * 5.2, smoothstep(0.35, 0.9, facing));
    float rimAmt = edge * mix(0.25, 1.0, facing) * uIntro * uBoost * uRimScale;

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
type Pointer = { x: number; y: number; impulse: number; at: number; inside: boolean };

/** 0..1, decays ~exponentially after the pointer stops. */
const pointerSpeed = (p: Pointer) => p.impulse * Math.exp(-(performance.now() - p.at) / 450);

function usePointer() {
  const ref = useRef<Pointer>({ x: 0, y: 0, impulse: 0, at: 0, inside: false });
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
      ref.current.inside = true;
      lastX = x;
      lastY = y;
    };
    const onLeave = () => {
      ref.current.x = 0;
      ref.current.y = 0;
      ref.current.inside = false;
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

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

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

/** Deterministic pseudo-random in 0..1 (no Math.random during render). */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const STAR_COUNT = 650;

function Stars() {
  const pixelRatio = useThree((s) => s.viewport.dpr);
  const geometry = useMemo(() => {
    const pos = new Float32Array(STAR_COUNT * 3);
    const size = new Float32Array(STAR_COUNT);
    const phase = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      pos[i * 3] = (hash(i) - 0.5) * 150;
      pos[i * 3 + 1] = 0.5 + Math.pow(hash(i + 1000), 0.7) * 30;
      pos[i * 3 + 2] = -50 - hash(i + 2000) * 8;
      size[i] = 0.6 + Math.pow(hash(i + 3000), 6) * 2.6;
      phase[i] = hash(i + 4000);
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
          uBlur: { value: 0 },
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
    u.uBlur.value = shared.dof;
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
          uBlur: { value: 0 },
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
    u.uBlur.value = shared.dof;
  });

  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} position={[0, FLOOR_Y, -20]} material={material}>
      <planeGeometry args={[90, 50]} />
    </mesh>
  );
}

/** Layer 2: sun + haze. Drifts by angle (parallax), and publishes the sun's screen position for the rays. */
function Sky({ pointer, strength }: { pointer: RefObject<Pointer>; strength: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: worldVertex,
        fragmentShader: skyFragment,
        uniforms: {
          uTime: { value: 0 },
          uIntro: { value: 0 },
          uBlur: { value: 0 },
          uShift: { value: new THREE.Vector2() },
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
  const scratch = useMemo(() => ({ dir: new THREE.Vector3(), pt: new THREE.Vector3() }), []);

  useFrame((state, delta) => {
    const u = mesh.current?.material.uniforms;
    if (!u) return;
    const t = state.clock.elapsedTime;
    const p = pointer.current;
    u.uTime.value = t;
    u.uIntro.value = easeOut(t / 2);
    u.uBlur.value = shared.dof;
    const shift = u.uShift.value as THREE.Vector2;
    easing.damp2(shift, [-p.x * SKY_DRIFT.x * strength, -p.y * SKY_DRIFT.y * strength], 0.35, delta);

    // Sun direction → a point far along it → screen UV (for the light rays).
    const cam = state.camera;
    scratch.dir.set(Math.tan(shift.x), Math.tan(SUN_ELEVATION + shift.y), -1).normalize();
    scratch.pt.copy(cam.position).addScaledVector(scratch.dir, 40).project(cam);
    shared.sun.set(scratch.pt.x * 0.5 + 0.5, scratch.pt.y * 0.5 + 0.5);
  });

  return (
    <mesh ref={mesh} position={[0, 4, -42]} material={material} renderOrder={-1}>
      <planeGeometry args={[160, 60]} />
    </mesh>
  );
}

const EMBERS_PER_LAYER = 100;

/** Dust / embers rising around the silhouette: one layer behind it, one in front. */
function Embers({ layer, intensity }: { layer: "back" | "front"; intensity: number }) {
  const pixelRatio = useThree((s) => s.viewport.dpr);
  const geometry = useMemo(() => {
    const seeds = new Float32Array(EMBERS_PER_LAYER * 3);
    const off = layer === "back" ? 0 : 5000;
    for (let i = 0; i < EMBERS_PER_LAYER; i++) {
      seeds[i * 3] = hash(i + off + 11);
      seeds[i * 3 + 1] = hash(i + off + 23);
      seeds[i * 3 + 2] = hash(i + off + 37);
    }
    const g = new THREE.BufferGeometry();
    // Positions are computed in the shader; three still wants a position attribute.
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(EMBERS_PER_LAYER * 3), 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 12);
    return g;
  }, [layer]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: emberVertex,
        fragmentShader: emberFragment,
        uniforms: {
          uTime: { value: 0 },
          uIntro: { value: 0 },
          uIntensity: { value: 0.5 },
          uPixelRatio: { value: 1 },
          uZ0: { value: layer === "back" ? -2.2 : 0.35 },
          uZ1: { value: layer === "back" ? -0.2 : 2.6 },
          uA: { value: ORANGE.clone() },
          uB: { value: LIME.clone().lerp(new THREE.Color("#ffffff"), 0.2) },
        },
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }),
    [layer],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  // 200 max in all; the intensity slider sets how many of them are alive.
  useEffect(() => {
    geometry.setDrawRange(0, Math.round(EMBERS_PER_LAYER * clamp01(0.25 + intensity * 0.75)));
  }, [geometry, intensity]);

  const points = useRef<THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>>(null);
  useFrame((state) => {
    const u = points.current?.material.uniforms;
    if (!u) return;
    const t = state.clock.elapsedTime;
    u.uTime.value = t;
    u.uIntro.value = easeOut((t - 1.2) / 2);
    u.uIntensity.value = 0.35 + intensity * 0.9;
    u.uPixelRatio.value = pixelRatio;
  });

  return <points ref={points} geometry={geometry} material={material} renderOrder={layer === "back" ? 1 : 3} frustumCulled={false} />;
}

/** Coloured fog in front of the silhouette, drifting and re-tinting with the pointer. */
function Fog({ pointer }: { pointer: RefObject<Pointer> }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: worldVertex,
        fragmentShader: fogFragment,
        uniforms: {
          uTime: { value: 0 },
          uIntro: { value: 0 },
          uPointer: { value: new THREE.Vector2() },
          uA: { value: LIME.clone() },
          uB: { value: ORANGE.clone().lerp(RED, 0.4) },
          uC: { value: new THREE.Color("#5a6cff") },
        },
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  const mesh = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>>(null);

  useFrame((state, delta) => {
    const u = mesh.current?.material.uniforms;
    if (!u) return;
    const t = state.clock.elapsedTime;
    const p = pointer.current;
    u.uTime.value = t;
    u.uIntro.value = easeOut((t - 0.8) / 2.5);
    easing.damp2(u.uPointer.value as THREE.Vector2, [p.x, p.y], 0.6, delta);
  });

  return (
    <mesh ref={mesh} position={[0, -0.2, 1.4]} material={material} renderOrder={4}>
      <planeGeometry args={[9, 5.2]} />
    </mesh>
  );
}

type SilhouetteProps = {
  pointer: RefObject<Pointer>;
  poses: HeroConfig["poses"];
  features: HeroFeatures;
  reducedMotion: boolean;
};

const ZERO2: [number, number] = [0, 0];

function Silhouette({ pointer, poses, features, reducedMotion }: SilhouetteProps) {
  const gl = useThree((s) => s.gl);
  // Order: ladder (7, left → right), then up, then down — the indices the frame loop uses.
  const all = useMemo(() => [...poses.ladder, poses.up, poses.down], [poses]);
  const textures = useTexture(
    all.map((p) => p.src),
    (loaded) => {
      for (const t of loaded) {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
        // No mipmaps: each pixel picks its pose inside a branch, where mip
        // selection (screen derivatives) would be unreliable. The poses are
        // drawn near 1:1, so nothing is lost.
        t.generateMipmaps = false;
        t.minFilter = THREE.LinearFilter;
        t.needsUpdate = true;
      }
    },
  );
  const tints = useMemo(() => all.map((p) => new THREE.Color(p.tint)), [all]);

  // Anchor alignment: measured once per texture set (on load), plus each pose's manual nudge.
  const autoOffsets = useRef<([number, number] | null)[]>([]);
  useEffect(() => {
    if (!features.autoAlign) {
      autoOffsets.current = [];
      return;
    }
    const images = textures.map((t) => t.image as HTMLImageElement | ImageBitmap);
    // Off the critical path: align after the first frames are up.
    const id = window.setTimeout(() => {
      autoOffsets.current = alignAll(images, CENTRE);
    }, 300);
    return () => window.clearTimeout(id);
  }, [textures, features.autoAlign]);
  const manual = useMemo(() => all.map((p) => p.offset ?? ZERO2), [all]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: worldVertex,
        fragmentShader: silhouetteFragment,
        uniforms: {
          uT0: { value: textures[CENTRE] },
          uT1: { value: textures[CENTRE] },
          uT2: { value: textures[CENTRE] },
          uT3: { value: textures[CENTRE] },
          uO0: { value: new THREE.Vector2() },
          uO1: { value: new THREE.Vector2() },
          uO2: { value: new THREE.Vector2() },
          uO3: { value: new THREE.Vector2() },
          uW: { value: new THREE.Vector4(1, 0, 0, 0) },
          uPrev: { value: textures[CENTRE] },
          uPrevO: { value: new THREE.Vector2() },
          uMotion: { value: 0 },
          uBlurDir: { value: 1 },
          uDither: { value: 0 },
          uLight: { value: new THREE.Vector2(0, 1) },
          uIntro: { value: 0 },
          uHue: { value: 0 },
          uBoost: { value: 1 },
          uRimScale: { value: 1 },
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
    // Keyed (not an array) so maath can keep a velocity per pose; index 3 = centre.
    weights: Object.fromEntries(POSE_KEYS.map((k, i) => [k, i === CENTRE ? 1 : 0])) as Record<string, number>,
    order: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    tint: new THREE.Color(),
    hIndex: CENTRE,
    vState: 0 as -1 | 0 | 1,
    current: CENTRE,
    previous: CENTRE,
    motionAt: -Infinity,
    blurDir: 1,
    frame: 0,
    hue: { v: 0 },
    tintAmt: { v: 0 },
    hover: { v: 0 },
    tilt: { v: 0 },
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
    const now = performance.now();
    const offsetOf = (i: number, out: THREE.Vector2) => {
      const a = autoOffsets.current[i] ?? ZERO2;
      return out.set(a[0] + manual[i][0], a[1] + manual[i][1]);
    };

    // 1. Target pose: nearest ladder step (with hysteresis), or up / down near the centre column.
    const pos = Math.min(6, Math.max(0, (p.x - LADDER.first) / LADDER.step));
    if (Math.abs(pos - s.hIndex) > 0.5 + LADDER.hysteresis) s.hIndex = Math.round(pos);
    const ay = Math.abs(p.y);
    const inColumn = Math.abs(pos - CENTRE) <= VERTICAL.column;
    if (s.vState === 0) {
      if (inColumn && ay > VERTICAL.swap + VERTICAL.hysteresis) s.vState = p.y > 0 ? 1 : -1;
    } else if (!inColumn || ay < VERTICAL.swap - VERTICAL.hysteresis || Math.sign(p.y) !== s.vState) {
      s.vState = 0;
    }
    const target = s.vState === 1 ? UP : s.vState === -1 ? DOWN : s.hIndex;

    // A new target starts the 80ms smear from the pose we're leaving.
    if (target !== s.current) {
      s.previous = s.current;
      s.current = target;
      s.motionAt = now;
      s.blurDir = target <= 6 && s.previous <= 6 ? Math.sign(target - s.previous) || 1 : s.previous === UP || target === DOWN ? -1 : 1;
    }
    const motion = reducedMotion ? 0 : Math.max(0, 1 - (now - s.motionAt) / MOTION.ms);
    u.uMotion.value = motion;
    u.uBlurDir.value = s.blurDir;
    u.uPrev.value = textures[s.previous];
    offsetOf(s.previous, u.uPrevO.value as THREE.Vector2);

    // 2. Weights dissolve toward the one-hot target (~200ms); dust snaps to 0 / 1.
    const wt = s.weights;
    for (let i = 0; i < POSE_KEYS.length; i++) {
      easing.damp(wt, POSE_KEYS[i], i === target ? 1 : 0, POSE_DAMP, delta);
      if (wt[POSE_KEYS[i]] < 0.012) wt[POSE_KEYS[i]] = 0;
      else if (wt[POSE_KEYS[i]] > 0.988) wt[POSE_KEYS[i]] = 1;
    }
    s.order.sort((a, b) => wt[POSE_KEYS[b]] - wt[POSE_KEYS[a]]);
    let sum = 0;
    for (let k = 0; k < SLOTS; k++) sum += wt[POSE_KEYS[s.order[k]]];
    sum = sum || 1;
    const slots = [u.uT0, u.uT1, u.uT2, u.uT3];
    const offs = [u.uO0, u.uO1, u.uO2, u.uO3];
    const w = u.uW.value as THREE.Vector4;
    for (let k = 0; k < SLOTS; k++) {
      const idx = s.order[k];
      slots[k].value = textures[idx];
      offsetOf(idx, offs[k].value as THREE.Vector2);
      w.setComponent(k, wt[POSE_KEYS[idx]] / sum);
    }
    // A new threshold offset every frame turns the ordered dither into a temporal dissolve.
    s.frame = (s.frame + 1) % 4096;
    u.uDither.value = (s.frame * 0.6180339887) % 1;

    // 3. Reactive lighting: blended pose tint, stronger the further the head turns.
    s.tint.setRGB(0, 0, 0);
    for (let i = 0; i < POSE_KEYS.length; i++) {
      const wi = wt[POSE_KEYS[i]];
      s.tint.r += tints[i].r * wi;
      s.tint.g += tints[i].g * wi;
      s.tint.b += tints[i].b * wi;
    }
    (u.uTint.value as THREE.Color).copy(s.tint);
    const vertical = wt[POSE_KEYS[UP]] + wt[POSE_KEYS[DOWN]];
    const turn = clamp01(Math.max(Math.abs(p.x) * 1.15, vertical));
    easing.damp(s.tintAmt, "v", features.reactiveLighting ? turn * 0.85 : 0, 0.3, delta);
    u.uTintAmt.value = s.tintAmt.v;
    // Up / down poses are subtler — 30% less rim.
    u.uRimScale.value = 1 - (1 - VERTICAL.rim) * vertical;

    // 4. Lean into the pointer + a 3D head tilt (±0.12 rad) across the up/down range.
    const centreness = 1 - clamp01(Math.abs(pos - CENTRE) / 1.5);
    const tiltAmt = smooth(VERTICAL.start, VERTICAL.full, ay) * centreness;
    easing.damp(s.tilt, "v", -Math.sign(p.y) * VERTICAL.tilt * tiltAmt, 0.07, delta);
    easing.dampE(g.rotation, [-p.y * LEAN.pitch + s.tilt.v, p.x * LEAN.yaw, p.y * LEAN.roll], 0.15, delta);
    easing.damp3(g.position, [p.x * LEAN.x, SILHOUETTE.y + p.y * LEAN.y, 0], 0.15, delta);

    // Light swings toward the pointer, always coming from somewhere above.
    s.lightTarget.set(p.x, 0.55 + p.y * 0.45).normalize();
    easing.damp2(s.light, s.lightTarget, 0.4, delta);
    u.uLight.value.copy(s.light).normalize();

    easing.damp(s.hue, "v", p.x, 0.25, delta);
    u.uHue.value = s.hue.v;

    // Rim flash: fast pointer or a logo click → brighter for 200ms; logo hover → brighter while held.
    if (pointerSpeed(p) > 0.5) s.flashAt = now;
    if (heroSignals.pulseAt > s.flashAt) s.flashAt = heroSignals.pulseAt;
    const flash = Math.max(0, 1 - (now - s.flashAt) / 200);
    easing.damp(s.hover, "v", heroSignals.hover > 0 ? 1 : 0, 0.2, delta);
    u.uBoost.value = 1 + 0.8 * flash + 0.5 * s.hover.v;

    u.uIntro.value = easeOut((t - 0.5) / 1.8);
    shared.energy = features.reactiveLighting ? s.tintAmt.v * 0.6 + s.hover.v * 0.5 + flash * 0.4 : 0;

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
 * a short hand-held shake when the pointer is flicked, and the focus pull
 * (depth of field) when the pointer rests near the centre.
 */
function CameraRig({ pointer, shake, dof }: { pointer: RefObject<Pointer>; shake: boolean; dof: boolean }) {
  const st = useRef({
    // YXZ: yaw first, then pitch — no roll, so the horizon stays level.
    euler: new THREE.Euler(CAMERA.pitch, 0, 0, "YXZ"),
    base: new THREE.Vector3(0, CAMERA.y, CAMERA.z),
    last: new THREE.Vector2(),
    shakeAt: -Infinity,
    focus: { v: 0 },
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

    // Depth of field: the background softens while the pointer rests near the centre.
    const focusTarget = dof ? 1 - smooth(0.12, 0.55, Math.hypot(p.x, p.y)) : 0;
    easing.damp(s.focus, "v", focusTarget, 0.45, delta);
    shared.dof = s.focus.v;
  });
  return null;
}

/**
 * Post: Bloom (follows rim energy) → light rays → grade (filter + scroll hue)
 * → cursor ripple → chromatic aberration (breathes at idle, spikes with
 * pointer speed).
 */
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

  const rays = useMemo(() => new LightRaysEffect(), []);
  const grade = useMemo(() => new GradeEffect(), []);
  const ripple = useMemo(() => new RippleEffect(), []);
  useEffect(
    () => () => {
      rays.dispose();
      grade.dispose();
      ripple.dispose();
    },
    [rays, grade, ripple],
  );
  const rippleState = useRef({ at: -Infinity });
  // The frame loop drives the effects through these refs (the instances above are render-time values).
  const raysRef = useRef<LightRaysEffect>(null);
  const gradeRef = useRef<GradeEffect>(null);
  const rippleRef = useRef<RippleEffect>(null);

  const useRays = features.lightRays && features.rayIntensity > 0;
  const useGrade = features.filter !== "none" || features.hueShift;
  const useRipple = features.cursorRipple && !reducedMotion;

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const effect = ca.current;
    if (effect) {
      const breathe = reducedMotion ? 1 : 1 + CA.breathe * Math.sin((t * Math.PI * 2) / CA.period);
      const k = caScale * breathe * (1 + pointerSpeed(pointer.current) * CA.spike);
      easing.damp2(effect.offset, [Math.min(CA.max, CA.x * k), Math.min(CA.max, CA.y * k)], 0.12, delta);
    }
    if (bloom.current) {
      easing.damp(level.current, "v", bloomBase * (1 + 0.35 * shared.energy), 0.25, delta);
      bloom.current.intensity = level.current.v;
    }

    const rayFx = raysRef.current;
    if (rayFx) {
      rayFx.sun.copy(shared.sun);
      rayFx.intensity = clamp01(features.rayIntensity) * (0.5 + 0.5 * easeOut((t - 1) / 2.5));
      rayFx.time = t;
    }

    const gradeFx = gradeRef.current;
    if (gradeFx) {
      gradeFx.mode = FILTER_MODE[features.filter] ?? 0;
      gradeFx.hue = features.hueShift ? Math.min(1.5, window.scrollY / window.innerHeight) * HUE_PER_VH : 0;
    }

    // Ripple: after 3s without movement (pointer over the page), then every 3s while still idle.
    const p = pointer.current;
    const now = performance.now();
    const r = rippleState.current;
    const rippleFx = rippleRef.current;
    if (rippleFx) {
      if (p.inside && now - p.at >= RIPPLE.idleMs && now - r.at >= RIPPLE.idleMs + RIPPLE.lifeMs * 0.3) {
        r.at = now;
        rippleFx.center.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
      }
      rippleFx.age = Math.min(1, (now - r.at) / RIPPLE.lifeMs);
    }
  });

  return (
    <EffectComposer multisampling={0}>
      <Bloom ref={bloom} mipmapBlur intensity={bloomBase} luminanceThreshold={0.45} luminanceSmoothing={0.2} radius={0.7} />
      {useRays && <primitive ref={raysRef} object={rays} dispose={null} />}
      {useGrade && <primitive ref={gradeRef} object={grade} dispose={null} />}
      {useRipple && <primitive ref={rippleRef} object={ripple} dispose={null} />}
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
 * silhouette with embers and fog, then Bloom, light rays, grade, ripple and
 * Chromatic Aberration. Only mounted for fine pointers with motion allowed —
 * Hero renders a static fallback elsewhere.
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
        <Sky pointer={pointer} strength={depth} />
        <ParallaxLayer pointer={pointer} strength={depth} {...LAYERS.front}>
          <Floor />
        </ParallaxLayer>
        {features.particles && <Embers layer="back" intensity={features.particleIntensity} />}
        <Suspense fallback={null}>
          <Silhouette pointer={pointer} poses={poses} features={features} reducedMotion={reducedMotion} />
          {onReady && <Ready onReady={onReady} />}
        </Suspense>
        {features.particles && <Embers layer="front" intensity={features.particleIntensity} />}
        {features.fog && <Fog pointer={pointer} />}
        <CameraRig pointer={pointer} shake={features.cameraShake && !reducedMotion} dof={features.depthOfField} />
        <Effects pointer={pointer} features={features} reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  );
}
