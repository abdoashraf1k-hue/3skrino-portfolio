"use client";

import { PerformanceMonitor, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { easing } from "maath";
import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { getCategory } from "@/data/categories";
import type { HeroConfig } from "@/data/hero-config";
import type { Project } from "@/data/projects";

/* ------------------------------------------------------------------ */
/* Tunables                                                            */
/* ------------------------------------------------------------------ */
/** The walls curve around this point (the visitor's spot in the room). */
const CENTER = new THREE.Vector3(0, 0.4, 5);
/** Three walls at growing distance: share of the tiles, rows, half-span (deg), row centre y. */
const WALLS = [
  { radius: 7.5, share: 0.4, rows: 2, span: 46, y: 0.4 },
  { radius: 10.2, share: 0.35, rows: 2, span: 54, y: 1.1 },
  { radius: 13, share: 0.25, rows: 2, span: 62, y: 1.8 },
] as const;
const ROW_GAP = 2.4;
const CAMERA = { y: 0.6, z: 10.5, fov: 40, dolly: 4.5 };
const ORBIT = { x: 2.6, y: 1.0, look: 0.8 };
const FOG = { near: 7, far: 24, color: new THREE.Color("#050505") };
const SILHOUETTE = { size: 3.6, y: -0.85, z: 2.4 };

type Props = {
  tiles: Project[];
  poses: HeroConfig["poses"];
  /** 0 → 1 scroll through the hero track: the camera dollies in. */
  progress: number;
  selected: number | null;
  onSelect: (i: number | null) => void;
  onReady: () => void;
};

type Slot = { pos: THREE.Vector3; rotY: number; normal: THREE.Vector3; tangent: THREE.Vector3; w: number; h: number };

function layout(tiles: Project[]): Slot[] {
  const out: Slot[] = [];
  let k = 0;
  WALLS.forEach((wall, li) => {
    const n = li === WALLS.length - 1 ? tiles.length - k : Math.round(tiles.length * wall.share);
    const cols = Math.max(1, Math.ceil(n / wall.rows));
    for (let j = 0; j < n; j++) {
      const row = j % wall.rows;
      const col = Math.floor(j / wall.rows);
      const t = cols === 1 ? 0.5 : col / (cols - 1);
      // Alternate walls are offset half a column so the back ones peek between the front ones.
      const theta = THREE.MathUtils.degToRad((t - 0.5) * 2 * wall.span + (li % 2 ? wall.span / cols : 0));
      const vertical = tiles[k + j].orientation === "vertical";
      out.push({
        pos: new THREE.Vector3(CENTER.x + Math.sin(theta) * wall.radius, wall.y + (row - (wall.rows - 1) / 2) * ROW_GAP, CENTER.z - Math.cos(theta) * wall.radius),
        rotY: -theta,
        normal: new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta)),
        tangent: new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta)),
        w: vertical ? 1.12 : 2,
        h: vertical ? 2 : 1.12,
      });
    }
    k += n;
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Tile textures — a gradient card, upgraded to the thumbnail if CORS allows */
/* ------------------------------------------------------------------ */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > max && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function tileTexture(p: Project, font: string): { texture: THREE.CanvasTexture; cancel: () => void } {
  const vertical = p.orientation === "vertical";
  const W = vertical ? 288 : 512;
  const H = vertical ? 512 : 288;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (!ctx) return { texture, cancel: () => undefined };

  const draw = (img: HTMLImageElement | null) => {
    const g = ctx.createLinearGradient(0, 0, W * 0.6, H);
    g.addColorStop(0, p.accentColor);
    g.addColorStop(0.55, "#141414");
    g.addColorStop(1, "#070707");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (img) {
      const s = Math.max(W / img.width, H / img.height);
      ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
    } else {
      // Scan texture on the placeholder.
      ctx.fillStyle = "rgb(255 255 255 / 0.04)";
      for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    }
    const shade = ctx.createLinearGradient(0, H * 0.45, 0, H);
    shade.addColorStop(0, "rgb(0 0 0 / 0)");
    shade.addColorStop(1, "rgb(0 0 0 / 0.85)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);

    const pad = Math.round(W * 0.07);
    ctx.fillStyle = "rgb(255 255 255 / 0.6)";
    ctx.font = `600 ${Math.round(W * 0.042)}px ${font}`;
    ctx.fillText((getCategory(p.category)?.name ?? p.category).toUpperCase(), pad, pad + 10);
    ctx.fillStyle = "#fff";
    ctx.font = `900 ${Math.round(W * (vertical ? 0.1 : 0.072))}px ${font}`;
    const lines = wrap(ctx, p.title.toUpperCase(), W - pad * 2);
    const lh = W * (vertical ? 0.105 : 0.075);
    lines.forEach((l, i) => ctx.fillText(l, pad, H - pad - lh * 0.6 - (lines.length - 1 - i) * lh));
    ctx.fillStyle = "rgb(255 255 255 / 0.55)";
    ctx.font = `500 ${Math.round(W * 0.038)}px ${font}`;
    ctx.fillText(`${p.year} · ${p.duration}`, pad, H - pad * 0.6);
    // ▶ badge
    ctx.strokeStyle = "rgb(255 255 255 / 0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W - pad - 14, pad + 4, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(W - pad - 18, pad - 3);
    ctx.lineTo(W - pad - 7, pad + 4);
    ctx.lineTo(W - pad - 18, pad + 11);
    ctx.fill();
    texture.needsUpdate = true;
  };

  draw(null);
  let img: HTMLImageElement | null = null;
  if (p.thumbnail) {
    img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => img && draw(img);
    img.src = p.thumbnail;
  }
  return {
    texture,
    cancel: () => {
      if (img) img.onload = null;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */
const vertex = /* glsl */ `
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

/** The film: lit by a fake spotlight cone from above, dimmed when another film is open, fogged by distance. */
const tileFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uHover;
  uniform float uDim;
  uniform vec3 uSpot;
  uniform vec3 uFog;
  uniform vec2 uFogRange;
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vec3 tex = texture2D(uMap, vUv).rgb;
    vec2 q = vec2((vUv.x - 0.5) * 1.5, (1.0 - vUv.y) * 0.95);
    float cone = smoothstep(1.05, 0.1, length(q));
    vec3 col = tex * (0.32 + 0.85 * cone + 0.45 * uHover);
    col += uSpot * cone * (0.05 + 0.08 * uHover);
    // a hairline frame
    vec2 e = min(vUv, 1.0 - vUv);
    float frame = 1.0 - smoothstep(0.0, 0.012, min(e.x, e.y));
    col = mix(col, vec3(0.75) + uSpot * 0.25 * uHover, frame * (0.35 + 0.5 * uHover));
    col *= mix(1.0, 0.28, uDim);
    float fog = smoothstep(uFogRange.x, uFogRange.y, vDepth);
    gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
    #include <colorspace_fragment>
  }
`;

/** The visible beam of light above each film. */
const beamFragment = /* glsl */ `
  uniform vec3 uSpot;
  uniform float uHover;
  uniform float uDim;
  uniform vec3 uFog;
  uniform vec2 uFogRange;
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    float spread = mix(0.12, 0.5, 1.0 - vUv.y);
    float x = abs(vUv.x - 0.5);
    float beam = smoothstep(spread, spread * 0.25, x) * pow(1.0 - vUv.y, 0.6) * smoothstep(0.0, 0.15, vUv.y);
    float a = beam * (0.10 + 0.14 * uHover) * mix(1.0, 0.3, uDim);
    a *= 1.0 - smoothstep(uFogRange.x, uFogRange.y, vDepth);
    gl_FragColor = vec4(mix(vec3(1.0), uSpot, 0.6), a);
  }
`;

const silhouetteFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uRim;
  uniform vec2 uOffset;
  uniform float uTexel;
  varying vec2 vUv;
  float alphaAt(vec2 uv) { return texture2D(uMap, uv - uOffset).a; }
  void main() {
    float a = alphaAt(vUv);
    float spread = uTexel * 3.0;
    float around = min(min(alphaAt(vUv + vec2(-spread, 0.0)), alphaAt(vUv + vec2(spread, 0.0))), alphaAt(vUv + vec2(0.0, spread)));
    float rim = clamp(a - around, 0.0, 1.0);
    vec3 col = vec3(0.012) + uRim * rim * 1.8;
    float feet = smoothstep(0.0, 0.16, vUv.y);
    gl_FragColor = vec4(col, a * feet);
    #include <colorspace_fragment>
  }
`;

const floorFragment = /* glsl */ `
  uniform vec3 uFog;
  uniform vec2 uFogRange;
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vec2 p = (vUv - 0.5) * 60.0;
    vec2 g = abs(fract(p) - 0.5) / fwidth(p);
    float line = 1.0 - min(min(g.x, g.y), 1.0);
    vec3 col = vec3(0.022) + vec3(0.05) * line;
    gl_FragColor = vec4(mix(col, uFog, smoothstep(uFogRange.x, uFogRange.y, vDepth)), 1.0);
  }
`;

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */
function usePointer(): RefObject<{ x: number; y: number }> {
  const ref = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const on = (e: PointerEvent) => {
      ref.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      ref.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", on, { passive: true });
    return () => window.removeEventListener("pointermove", on);
  }, []);
  return ref;
}

const fogUniforms = () => ({ uFog: { value: FOG.color }, uFogRange: { value: new THREE.Vector2(FOG.near, FOG.far) } });

type TileProps = {
  project: Project;
  slot: Slot;
  index: number;
  hovered: boolean;
  dim: boolean;
  font: string;
  onHover: (i: number | null) => void;
  onSelect: (i: number) => void;
};

function Tile({ project, slot, index, hovered, dim, font, onHover, onSelect }: TileProps) {
  const { texture, cancel } = useMemo(() => tileTexture(project, font), [project, font]);
  useEffect(
    () => () => {
      cancel();
      texture.dispose();
    },
    [texture, cancel],
  );
  const spot = useMemo(() => new THREE.Color(project.accentColor).lerp(new THREE.Color("#ffffff"), 0.35), [project.accentColor]);
  const tileMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: tileFragment,
        uniforms: { uMap: { value: texture }, uHover: { value: 0 }, uDim: { value: 0 }, uSpot: { value: spot }, ...fogUniforms() },
      }),
    [texture, spot],
  );
  const beamMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: beamFragment,
        uniforms: { uSpot: { value: spot }, uHover: { value: 0 }, uDim: { value: 0 }, ...fogUniforms() },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [spot],
  );
  useEffect(
    () => () => {
      tileMat.dispose();
      beamMat.dispose();
    },
    [tileMat, beamMat],
  );

  const group = useRef<THREE.Group>(null);
  const tileMesh = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>>(null);
  const beamMesh = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>>(null);
  useFrame((_, dt) => {
    for (const mesh of [tileMesh.current, beamMesh.current]) {
      if (!mesh) continue;
      easing.damp(mesh.material.uniforms.uHover, "value", hovered ? 1 : 0, 0.15, dt);
      easing.damp(mesh.material.uniforms.uDim, "value", dim ? 1 : 0, 0.3, dt);
    }
    if (group.current) easing.damp(group.current.scale, "x", hovered ? 1.05 : 1, 0.15, dt);
    if (group.current) group.current.scale.y = group.current.scale.x;
  });

  return (
    <group ref={group} position={slot.pos} rotation-y={slot.rotY}>
      <mesh
        ref={tileMesh}
        material={tileMat}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onHover(index);
        }}
        onPointerOut={() => onHover(null)}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect(index);
        }}
      >
        <planeGeometry args={[slot.w, slot.h]} />
      </mesh>
      <mesh ref={beamMesh} material={beamMat} position={[0, slot.h / 2 + 0.7, 0.05]} raycast={() => null}>
        <planeGeometry args={[slot.w * 1.6, 1.5]} />
      </mesh>
    </group>
  );
}

function Silhouette({ poses, pointer }: { poses: HeroConfig["poses"]; pointer: RefObject<{ x: number; y: number }> }) {
  const textures = useTexture(
    poses.ladder.map((p) => p.src),
    (loaded) => {
      for (const t of loaded) {
        t.colorSpace = THREE.SRGBColorSpace;
        t.needsUpdate = true;
      }
    },
  );
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: silhouetteFragment,
        uniforms: {
          uMap: { value: textures[3] },
          uRim: { value: new THREE.Color("#e7fe55") },
          uOffset: { value: new THREE.Vector2() },
          uTexel: { value: 1 / 1600 },
        },
        transparent: true,
        depthWrite: false,
      }),
    [textures],
  );
  useEffect(() => () => material.dispose(), [material]);
  const tints = useMemo(() => poses.ladder.map((p) => new THREE.Color(p.tint)), [poses.ladder]);
  const shown = useRef(3);
  const mesh = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>>(null);

  useFrame((_, dt) => {
    const u = mesh.current?.material.uniforms;
    if (!u) return;
    // The silhouette turns with the pointer through the 7-pose ladder (with a little hysteresis).
    const raw = ((pointer.current.x + 1) / 2) * (textures.length - 1);
    if (Math.abs(raw - shown.current) > 0.65) shown.current = Math.round(raw);
    const i = Math.min(textures.length - 1, Math.max(0, shown.current));
    u.uMap.value = textures[i];
    const off = poses.ladder[i]?.offset ?? [0, 0];
    u.uOffset.value.set(off[0], off[1]);
    easing.dampC(u.uRim.value, tints[i], 0.2, dt);
  });

  return (
    <mesh ref={mesh} material={material} position={[0, SILHOUETTE.y, SILHOUETTE.z]} raycast={() => null}>
      <planeGeometry args={[SILHOUETTE.size, SILHOUETTE.size]} />
    </mesh>
  );
}

function CameraRig({ slots, selected, progress, pointer }: { slots: Slot[]; selected: number | null; progress: number; pointer: RefObject<{ x: number; y: number }> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const look = useRef(new THREE.Vector3(0, CAMERA.y, -2));
  const want = useMemo(() => ({ pos: new THREE.Vector3(), look: new THREE.Vector3() }), []);

  useFrame((_, dt) => {
    const p = pointer.current;
    const slot = selected !== null ? slots[selected] : null;
    if (slot) {
      // Frame the film, then slide it left of the details panel.
      const aspect = size.width / Math.max(1, size.height);
      const fit = Math.max(slot.h, slot.w / aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2)));
      const shift = slot.tangent.clone().multiplyScalar(slot.w * 0.55 * (size.width > 900 ? 1 : 0));
      want.look.copy(slot.pos).add(shift);
      want.pos.copy(slot.pos).addScaledVector(slot.normal, fit * 1.3).add(shift);
    } else {
      want.pos.set(p.x * ORBIT.x, CAMERA.y + p.y * ORBIT.y, CAMERA.z - progress * CAMERA.dolly);
      want.look.set(p.x * ORBIT.look, CAMERA.y + p.y * 0.3, -2);
    }
    easing.damp3(camera.position, want.pos, slot ? 0.45 : 0.3, dt);
    easing.damp3(look.current, want.look, slot ? 0.4 : 0.25, dt);
    camera.lookAt(look.current);
  });
  return null;
}

function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    const id = requestAnimationFrame(onReady);
    return () => cancelAnimationFrame(id);
  }, [onReady]);
  return null;
}

function Room({ tiles, poses, progress, selected, onSelect, onReady }: Props) {
  const pointer = usePointer();
  const slots = useMemo(() => layout(tiles), [tiles]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [font, setFont] = useState("sans-serif");
  useEffect(() => {
    const id = requestAnimationFrame(() => setFont(getComputedStyle(document.body).fontFamily || "sans-serif"));
    return () => cancelAnimationFrame(id);
  }, []);
  const floorMat = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: floorFragment, uniforms: fogUniforms() }),
    [],
  );
  useEffect(() => () => floorMat.dispose(), [floorMat]);

  return (
    <>
      <mesh material={floorMat} rotation-x={-Math.PI / 2} position={[0, -2.2, 0]} raycast={() => null}>
        <planeGeometry args={[80, 80]} />
      </mesh>
      {tiles.map((p, i) => (
        <Tile
          key={`${p.id}-${i}`}
          project={p}
          slot={slots[i]}
          index={i}
          hovered={hovered === i}
          dim={selected !== null && selected !== i}
          font={font}
          onHover={setHovered}
          onSelect={onSelect}
        />
      ))}
      <Suspense fallback={null}>
        <Silhouette poses={poses} pointer={pointer} />
        <Ready onReady={onReady} />
      </Suspense>
      <CameraRig slots={slots} selected={selected} progress={progress} pointer={pointer} />
    </>
  );
}

/** Desktop only (GalleryHero renders a still wall elsewhere). */
export default function GalleryScene(props: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  const [dpr, setDpr] = useState(1.5);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0" data-cursor-label="Look">
      <Canvas
        dpr={dpr}
        frameloop={inView ? "always" : "never"}
        camera={{ fov: CAMERA.fov, position: [0, CAMERA.y, CAMERA.z], near: 0.1, far: 60 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance", stencil: false }}
        onPointerMissed={() => props.onSelect(null)}
      >
        <color attach="background" args={["#050505"]} />
        <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
        <Room {...props} />
      </Canvas>
    </div>
  );
}
