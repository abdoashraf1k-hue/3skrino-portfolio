"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { gsap } from "@/lib/gsap";

/* ------------------------------------------------------------------ */
/* Tunables                                                            */
/* ------------------------------------------------------------------ */
const MAX_PARTICLES = 8000;
const CAMERA_Z = 1000;
const FOV = 35;
const PUSH_RADIUS = 150; // px
const PUSH_FORCE = 5200; // px/s²
const SPRING_K = 55;
const SPRING_DAMPING = 9;
const BREATHE_PX = 2;
/** Scroll window (in viewport heights) over which the name scatters. */
const SCATTER_START = 0.4;
const SCATTER_END = 0.8;

const ACCENT = [0.906, 0.996, 0.333];

/* ------------------------------------------------------------------ */
/* Shaders — round, soft-edged points with perspective size            */
/* ------------------------------------------------------------------ */
const vertexShader = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  uniform float uSize;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * aSize * (${CAMERA_Z.toFixed(1)} / -mv.z);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.15, d);
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a * uOpacity);
  }
`;

/* ------------------------------------------------------------------ */
/* Text sampling                                                       */
/* ------------------------------------------------------------------ */
type Sample = {
  /** x, y in px, centred on the glyph bounding box, y up. */
  points: Float32Array;
  count: number;
  /** Offset of the text centre from the canvas centre, px, y up. */
  offsetX: number;
  offsetY: number;
};

async function sampleText(el: HTMLElement, canvasEl: HTMLCanvasElement): Promise<Sample | null> {
  const text = el.dataset.text ?? el.textContent ?? "";
  const cs = getComputedStyle(el);
  const fontSize = parseFloat(cs.fontSize);
  if (!text || !fontSize) return null;

  const font = `${cs.fontWeight} ${fontSize}px ${cs.fontFamily}`;
  try {
    await document.fonts.load(font, text);
  } catch {
    /* fall back to whatever is available */
  }

  const letterSpacing = parseFloat(cs.letterSpacing) || 0;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const setup = () => {
    ctx.font = font;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${letterSpacing}px`;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
  };
  setup();
  const pad = Math.ceil(fontSize * 0.15);
  const width = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const height = Math.ceil(fontSize * 1.4);
  canvas.width = width;
  canvas.height = height;
  setup(); // resizing a canvas resets its context state
  ctx.fillText(text, pad, height / 2);

  const { data } = ctx.getImageData(0, 0, width, height);
  const step = Math.max(1, Math.round(fontSize / 110));
  const hits: number[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (data[(y * width + x) * 4 + 3] > 128) {
        hits.push(x, y);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const total = hits.length / 2;
  if (!total) return null;

  // Random subset (partial Fisher–Yates) so density stays even.
  const count = Math.min(MAX_PARTICLES, total);
  const order = new Uint32Array(total);
  for (let i = 0; i < total; i++) order[i] = i;
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (total - i));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const points = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const k = order[i];
    points[i * 2] = hits[k * 2] - cx;
    points[i * 2 + 1] = -(hits[k * 2 + 1] - cy);
  }

  const textRect = el.getBoundingClientRect();
  const canvasRect = canvasEl.getBoundingClientRect();
  return {
    points,
    count,
    offsetX: textRect.left + textRect.width / 2 - (canvasRect.left + canvasRect.width / 2),
    offsetY: -(textRect.top + textRect.height / 2 - (canvasRect.top + canvasRect.height / 2)),
  };
}

/* ------------------------------------------------------------------ */
/* Simulation buffers                                                  */
/* ------------------------------------------------------------------ */
type Sim = {
  count: number;
  offsetX: number;
  offsetY: number;
  geometry: THREE.BufferGeometry;
  position: THREE.BufferAttribute;
  home: Float32Array; // x,y,z
  start: Float32Array; // x,y,z
  dir: Float32Array; // scatter direction x,y,z
  dist: Float32Array;
  spin: Float32Array;
  phase: Float32Array;
  speed: Float32Array;
  disp: Float32Array; // spring displacement x,y
  vel: Float32Array; // spring velocity x,y
};

function createSim(sample: Sample, formed: boolean): Sim {
  const n = sample.count;
  const home = new Float32Array(n * 3);
  const start = new Float32Array(n * 3);
  const dir = new Float32Array(n * 3);
  const dist = new Float32Array(n);
  const spin = new Float32Array(n);
  const phase = new Float32Array(n);
  const speed = new Float32Array(n);
  const colors = new Float32Array(n * 3);
  const sizes = new Float32Array(n);
  const positions = new Float32Array(n * 3);

  const spreadX = window.innerWidth * 0.75;
  const spreadY = window.innerHeight * 0.6;

  for (let i = 0; i < n; i++) {
    const i3 = i * 3;
    home[i3] = sample.points[i * 2];
    home[i3 + 1] = sample.points[i * 2 + 1];
    home[i3 + 2] = (Math.random() - 0.5) * 12;

    start[i3] = (Math.random() - 0.5) * 2 * spreadX;
    start[i3 + 1] = (Math.random() - 0.5) * 2 * spreadY;
    start[i3 + 2] = (Math.random() - 0.5) * 900;

    // Random unit vector, biased outward from the text centre.
    const theta = Math.random() * Math.PI * 2;
    const z = Math.random() * 2 - 1;
    const r = Math.sqrt(1 - z * z);
    dir[i3] = r * Math.cos(theta) + home[i3] * 0.002;
    dir[i3 + 1] = r * Math.sin(theta) + home[i3 + 1] * 0.002;
    dir[i3 + 2] = z;
    dist[i] = 350 + Math.random() * 1100;
    spin[i] = (Math.random() - 0.5) * 2.4;
    phase[i] = Math.random() * Math.PI * 2;
    speed[i] = 0.6 + Math.random() * 1.2;

    const accent = Math.random() < 0.03;
    const shade = 0.72 + Math.random() * 0.28;
    colors[i3] = accent ? ACCENT[0] : 0.96 * shade;
    colors[i3 + 1] = accent ? ACCENT[1] : 0.96 * shade;
    colors[i3 + 2] = accent ? ACCENT[2] : 0.96 * shade;
    sizes[i] = 0.7 + Math.random() * 0.8;

    const src = formed ? home : start;
    positions[i3] = src[i3];
    positions[i3 + 1] = src[i3 + 1];
    positions[i3 + 2] = src[i3 + 2];
  }

  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3);
  position.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", position);
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

  return {
    count: n,
    offsetX: sample.offsetX,
    offsetY: sample.offsetY,
    geometry,
    position,
    home,
    start,
    dir,
    dist,
    spin,
    phase,
    speed,
    disp: new Float32Array(n * 2),
    vel: new Float32Array(n * 2),
  };
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane();
const hit = new THREE.Vector3();
const ndc = new THREE.Vector2();

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function Particles({ targetRef }: { targetRef: RefObject<HTMLElement | null> }) {
  const gl = useThree((s) => s.gl);
  const groupRef = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const sim = useRef<Sim | null>(null);
  const formation = useRef({ p: 0 });
  const scatter = useRef(0);
  const mouse = useRef({ x: 0, y: 0, active: false });

  // Pointer tracked on window — HTML content sits above the canvas.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
      mouse.current.active = true;
    };
    const onLeave = () => {
      mouse.current.active = false;
    };
    window.addEventListener("mousemove", onMove);
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  // Sample the real H1 glyphs, build buffers, then fly particles into place.
  useEffect(() => {
    const el = targetRef.current;
    const points = pointsRef.current;
    if (!el || !points) return;

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uSize: { value: 2.3 * gl.getPixelRatio() },
        uOpacity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
    });
    (points.material as THREE.Material).dispose();
    points.material = material;

    let cancelled = false;
    let tween: gsap.core.Tween | null = null;
    let resizeTimer = 0;

    const build = async (animate: boolean) => {
      const sample = await sampleText(el, gl.domElement);
      if (cancelled || !sample) return;
      const next = createSim(sample, !animate);
      sim.current?.geometry.dispose();
      points.geometry = next.geometry;
      sim.current = next;
      material.uniforms.uSize.value = 2.3 * gl.getPixelRatio();
      if (animate) {
        formation.current.p = 0;
        tween = gsap.to(formation.current, { p: 1, duration: 2.5, ease: "expo.out", delay: 0.15 });
      } else {
        tween?.kill();
        formation.current.p = 1;
      }
    };

    void build(true);
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => void build(false), 250);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      tween?.kill();
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      material.dispose();
      sim.current?.geometry.dispose();
      sim.current = null;
    };
  }, [targetRef, gl]);

  useFrame((state, delta) => {
    const s = sim.current;
    const group = groupRef.current;
    const points = pointsRef.current;
    if (!s || !group || !points) return;
    const material = points.material as THREE.ShaderMaterial;
    const dt = Math.min(delta, 1 / 30);
    const t = state.clock.elapsedTime;
    const camera = state.camera as THREE.PerspectiveCamera;

    // 1 group unit = 1 CSS pixel on the z = 0 plane.
    const unitsPerPx = (2 * CAMERA_Z * Math.tan(THREE.MathUtils.degToRad(FOV) / 2)) / state.size.height;
    group.scale.setScalar(unitsPerPx);
    group.position.set(s.offsetX * unitsPerPx, s.offsetY * unitsPerPx, 0);

    // Scroll-driven scatter (hero is the first thing on the page).
    const progress = window.scrollY / window.innerHeight;
    const target = clamp01((progress - SCATTER_START) / (SCATTER_END - SCATTER_START));
    scatter.current += (target - scatter.current) * Math.min(1, dt * 8);
    const sc = scatter.current;
    if (sc > 0.995) {
      points.visible = false;
      return;
    }
    points.visible = true;

    // Pointer → NDC, gentle tilt toward it.
    const m = mouse.current;
    const rect = gl.domElement.getBoundingClientRect();
    const inside = m.active && m.y >= rect.top && m.y <= rect.bottom;
    ndc.set(((m.x - rect.left) / rect.width) * 2 - 1, -((m.y - rect.top) / rect.height) * 2 + 1);
    const tiltEase = Math.min(1, dt * 2.5);
    group.rotation.y += ((inside ? ndc.x * 0.06 : 0) - group.rotation.y) * tiltEase;
    group.rotation.x += ((inside ? -ndc.y * 0.04 : 0) - group.rotation.x) * tiltEase;
    group.updateMatrixWorld();

    // Raycast the pointer onto the text plane, in group-local px.
    let mx = 1e9;
    let my = 1e9;
    if (inside && sc < 0.2) {
      raycaster.setFromCamera(ndc, camera);
      plane.normal.set(0, 0, 1).applyQuaternion(group.quaternion);
      plane.constant = -plane.normal.dot(group.position);
      if (raycaster.ray.intersectPlane(plane, hit)) {
        group.worldToLocal(hit);
        mx = hit.x;
        my = hit.y;
      }
    }

    const e = formation.current.p;
    const sE = sc * sc;
    const r2 = PUSH_RADIUS * PUSH_RADIUS;
    const pos = s.position.array as Float32Array;
    const { home, start, dir, dist, spin, phase, speed, disp, vel } = s;

    for (let i = 0; i < s.count; i++) {
      const i3 = i * 3;
      const i2 = i * 2;

      // Formation: random start → glyph position.
      let x = start[i3] + (home[i3] - start[i3]) * e;
      let y = start[i3 + 1] + (home[i3 + 1] - start[i3 + 1]) * e;
      let z = start[i3 + 2] + (home[i3 + 2] - start[i3 + 2]) * e;

      // Breathing: tiny out-of-phase drift.
      const w = t * speed[i] + phase[i];
      x += Math.sin(w) * BREATHE_PX;
      y += Math.cos(w * 0.87 + phase[i]) * BREATHE_PX;

      // Pointer repulsion + damped spring back home.
      let vx = vel[i2];
      let vy = vel[i2 + 1];
      const dx = x + disp[i2] - mx;
      const dy = y + disp[i2 + 1] - my;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2) {
        const d = Math.sqrt(d2) || 1;
        const f = (1 - d / PUSH_RADIUS) * PUSH_FORCE;
        vx += (dx / d) * f * dt;
        vy += (dy / d) * f * dt;
      }
      vx += (-SPRING_K * disp[i2] - SPRING_DAMPING * vx) * dt;
      vy += (-SPRING_K * disp[i2 + 1] - SPRING_DAMPING * vy) * dt;
      disp[i2] += vx * dt;
      disp[i2 + 1] += vy * dt;
      vel[i2] = vx;
      vel[i2 + 1] = vy;
      x += disp[i2];
      y += disp[i2 + 1];

      // Scatter: fly outward along a random vector while swirling.
      if (sE > 0) {
        x += dir[i3] * dist[i] * sE;
        y += dir[i3 + 1] * dist[i] * sE;
        z += dir[i3 + 2] * dist[i] * sE;
        const a = spin[i] * sE;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const rx = x * c - y * sn;
        y = x * sn + y * c;
        x = rx;
      }

      pos[i3] = x;
      pos[i3 + 1] = y;
      pos[i3 + 2] = z;
    }
    s.position.needsUpdate = true;

    material.uniforms.uOpacity.value = (0.15 + 0.85 * clamp01(e * 1.4)) * Math.pow(1 - sc, 1.3);
  });

  return (
    <group ref={groupRef}>
      <points ref={pointsRef} frustumCulled={false} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Canvas                                                              */
/* ------------------------------------------------------------------ */
export default function ParticleName({ targetRef }: { targetRef: RefObject<HTMLElement | null> }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);

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
        dpr={[1, 2]}
        frameloop={inView ? "always" : "never"}
        camera={{ fov: FOV, position: [0, 0, CAMERA_Z], near: 1, far: 5000 }}
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
        style={{ pointerEvents: "none" }}
      >
        <Particles targetRef={targetRef} />
      </Canvas>
    </div>
  );
}
