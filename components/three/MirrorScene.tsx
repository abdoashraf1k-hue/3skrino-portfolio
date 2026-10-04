"use client";

import { PerformanceMonitor, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { easing } from "maath";
import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import type { HeroPose } from "@/data/hero-config";

/* ------------------------------------------------------------------ */
/* Tunables                                                            */
/* ------------------------------------------------------------------ */
const RADIUS = 3.9;
/** Half the arc the mirrors span (deg). */
const ARC = 78;
const MIRROR = { w: 1.35, h: 3.3, y: 0.1 };
const FLOOR_Y = MIRROR.y - MIRROR.h / 2 - 0.02;
const FIGURE = { size: 3.1, z: 0.9 };
const CAMERA = { y: 0.35, z: 7.8, fov: 38, dolly: 1.1 };
/** How far the room turns at the screen edge (rad). */
const TURN = { y: 0.3, x: 0.05 };
/** The figure fills this share of a mirror's height. */
const FIGURE_IN_GLASS = 0.8;

type Props = {
  poses: HeroPose[];
  /** Pose index shown in each mirror. */
  slots: number[];
  /** Pose index of the figure in the centre. */
  centre: number;
  frozen: boolean;
  progress: number;
  onHoverMirror: (i: number) => void;
  onClickMirror: () => void;
  onReady: () => void;
};

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */
const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** A pane of dark glass holding a pose and its echoes receding into itself. */
const mirrorFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uOffset;
  uniform vec2 uPar;
  uniform float uAspect;
  uniform float uFill;
  uniform float uFade;
  uniform float uHover;
  uniform float uReflect;
  varying vec2 vUv;

  float figure(vec2 p) {
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return 0.0;
    return texture2D(uMap, p - uOffset).a;
  }

  void main() {
    vec2 uv = vUv;
    vec3 col = mix(vec3(0.03), vec3(0.075), uv.y);
    // Panel uv → square pose texture, standing on the bottom edge.
    vec2 p = (uv - vec2(0.5, 0.0)) * vec2(uAspect, 1.0) / uFill + vec2(0.5, 0.0);
    vec2 vp = vec2(0.5, 0.5);
    float lit = 0.0;
    float frames = 0.0;
    for (int k = 0; k < 4; k++) {
      float fk = float(k);
      float s = pow(0.72, fk);
      vec2 off = uPar * (fk + 1.0) * 0.035;
      lit += figure((p - vp - off) / s + vp) * pow(0.5, fk) * 0.85;
      // the nested frame of the k-th reflection
      vec2 d = abs(uv - vec2(0.5) - off * 0.6) / (0.5 * s);
      float m = max(d.x, d.y);
      if (k > 0) frames += (1.0 - smoothstep(0.0, 0.012 / s, abs(m - 0.94))) * 0.08 / fk;
    }
    col += vec3(0.8, 0.8, 0.82) * lit + vec3(frames);
    // a sheen that slides with the room
    float sheen = smoothstep(0.08, 0.0, abs(uv.x * 0.6 + uv.y * 0.4 - 0.5 - uPar.x * 0.35));
    col += sheen * (0.05 + 0.05 * uHover);
    // edge
    vec2 e = min(uv, 1.0 - uv);
    float edge = 1.0 - smoothstep(0.0, 0.014, min(e.x * uAspect, e.y) * 2.0);
    col = mix(col, vec3(0.55 + 0.4 * uHover), edge);
    col *= 1.0 + 0.25 * uHover;
    float a = uFade;
    if (uReflect > 0.5) a *= pow(1.0 - uv.y, 3.0) * 0.32;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;

/** The real figure: near-black with a cold rim; flashes brighter on a swap. */
const figureFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uOffset;
  uniform float uTexel;
  uniform float uFlash;
  uniform float uFade;
  uniform float uReflect;
  varying vec2 vUv;
  float alphaAt(vec2 uv) { return texture2D(uMap, uv - uOffset).a; }
  void main() {
    float a = alphaAt(vUv);
    float s = uTexel * 3.0;
    float around = min(min(alphaAt(vUv + vec2(-s, 0.0)), alphaAt(vUv + vec2(s, 0.0))), alphaAt(vUv + vec2(0.0, s)));
    float rim = clamp(a - around, 0.0, 1.0);
    vec3 col = vec3(0.012) + vec3(0.92, 0.94, 1.0) * rim * (1.4 + uFlash * 2.0);
    float alpha = a * smoothstep(0.0, 0.12, vUv.y) * uFade;
    if (uReflect > 0.5) alpha *= pow(1.0 - vUv.y, 3.0) * 0.4;
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

/** Polished black floor with a faint grid; translucent so the reflections show through. */
const floorFragment = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 40.0;
    vec2 g = abs(fract(p) - 0.5) / fwidth(p);
    float line = 1.0 - min(min(g.x, g.y), 1.0);
    float r = length(vUv - 0.5) * 2.0;
    vec3 col = vec3(0.02) + vec3(0.035) * line * (1.0 - smoothstep(0.1, 0.6, r));
    gl_FragColor = vec4(col, mix(0.72, 1.0, smoothstep(0.05, 0.5, r)));
  }
`;

const backdropFragment = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * vec2(24.0, 12.0);
    vec2 g = abs(fract(p) - 0.5) / fwidth(p);
    float line = 1.0 - min(min(g.x, g.y), 1.0);
    float haze = 1.0 - smoothstep(0.0, 0.7, length((vUv - vec2(0.5, 0.42)) * vec2(1.0, 1.6)));
    vec3 col = vec3(0.024) + vec3(0.03) * line * haze + vec3(0.04) * haze;
    gl_FragColor = vec4(col, 1.0);
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

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

type PaneProps = {
  texture: THREE.Texture;
  pose: HeroPose;
  angle: number;
  fade: number;
  reflect: boolean;
  hovered: boolean;
  pointer: RefObject<{ x: number; y: number }>;
  onOver?: () => void;
  onOut?: () => void;
  onClick?: () => void;
};

function Pane({ texture, pose, angle, fade, reflect, hovered, pointer, onOver, onOut, onClick }: PaneProps) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: mirrorFragment,
        uniforms: {
          uMap: { value: texture },
          uOffset: { value: new THREE.Vector2() },
          uPar: { value: new THREE.Vector2() },
          uAspect: { value: MIRROR.w / MIRROR.h },
          uFill: { value: FIGURE_IN_GLASS },
          uFade: { value: 1 },
          uHover: { value: 0 },
          uReflect: { value: reflect ? 1 : 0 },
        },
        transparent: true,
        depthWrite: !reflect,
      }),
    // the texture is swapped through the uniform below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reflect],
  );
  useEffect(() => () => material.dispose(), [material]);
  const mesh = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>>(null);

  useFrame((_, dt) => {
    const u = mesh.current?.material.uniforms;
    if (!u) return;
    u.uMap.value = texture;
    const off = pose.offset ?? [0, 0];
    u.uOffset.value.set(off[0], off[1]);
    // Parallax: the reflections slide against the pointer, more on the side mirrors.
    const p = pointer.current;
    easing.damp2(u.uPar.value, [-(p.x + Math.sin(angle) * 0.6), -p.y * 0.5], 0.25, dt);
    easing.damp(u.uFade, "value", fade, 0.2, dt);
    easing.damp(u.uHover, "value", hovered ? 1 : 0, 0.15, dt);
  });

  const x = Math.sin(angle) * RADIUS;
  const z = -Math.cos(angle) * RADIUS;
  return (
    <mesh
      ref={mesh}
      material={material}
      position={[x, reflect ? 2 * FLOOR_Y - MIRROR.y : MIRROR.y, z]}
      rotation-y={-angle}
      scale-y={reflect ? -1 : 1}
      renderOrder={reflect ? -1 : 0}
      raycast={reflect ? () => null : undefined}
      onPointerOver={
        onOver &&
        ((e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          onOver();
        })
      }
      onPointerOut={onOut}
      onClick={
        onClick &&
        ((e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onClick();
        })
      }
    >
      <planeGeometry args={[MIRROR.w, MIRROR.h]} />
    </mesh>
  );
}

function Figure({ texture, pose, reflect, flashKey }: { texture: THREE.Texture; pose: HeroPose; reflect: boolean; flashKey: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: figureFragment,
        uniforms: {
          uMap: { value: texture },
          uOffset: { value: new THREE.Vector2() },
          uTexel: { value: 1 / 1600 },
          uFlash: { value: 0 },
          uFade: { value: 1 },
          uReflect: { value: reflect ? 1 : 0 },
        },
        transparent: true,
        depthWrite: false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reflect],
  );
  useEffect(() => () => material.dispose(), [material]);
  const mesh = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>>(null);
  const lastKey = useRef(flashKey);
  useFrame((_, dt) => {
    const u = mesh.current?.material.uniforms;
    if (!u) return;
    // A new pose stepped in: flash the rim.
    if (lastKey.current !== flashKey) {
      lastKey.current = flashKey;
      u.uFlash.value = 1;
    }
    u.uMap.value = texture;
    const off = pose.offset ?? [0, 0];
    u.uOffset.value.set(off[0], off[1]);
    easing.damp(u.uFlash, "value", 0, 0.25, dt);
  });
  const y = FLOOR_Y + FIGURE.size / 2;
  return (
    <mesh ref={mesh} material={material} position={[0, reflect ? 2 * FLOOR_Y - y : y, FIGURE.z]} scale-y={reflect ? -1 : 1} renderOrder={reflect ? -1 : 1} raycast={() => null}>
      <planeGeometry args={[FIGURE.size, FIGURE.size]} />
    </mesh>
  );
}

function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    const id = requestAnimationFrame(onReady);
    return () => cancelAnimationFrame(id);
  }, [onReady]);
  return null;
}

function Room({ poses, slots, centre, frozen, progress, onHoverMirror, onClickMirror, onReady }: Props) {
  const pointer = usePointer();
  const textures = useTexture(
    poses.map((p) => p.src),
    (loaded) => {
      for (const t of loaded) {
        t.colorSpace = THREE.SRGBColorSpace;
        t.needsUpdate = true;
      }
    },
  );
  const camera = useThree((s) => s.camera);
  const room = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const n = slots.length;
  const angles = useMemo(() => Array.from({ length: n }, (_, i) => THREE.MathUtils.degToRad(n === 1 ? 0 : -ARC + (2 * ARC * i) / (n - 1))), [n]);
  // Scroll: the outermost mirrors leave first.
  const rank = useMemo(() => {
    const order = angles.map((a, i) => ({ i, a: Math.abs(a) })).sort((x, y) => y.a - x.a);
    const r: number[] = [];
    order.forEach((o, k) => (r[o.i] = k));
    return r;
  }, [angles]);
  const fadeOf = (i: number) => 1 - smoothstep(rank[i] * 0.11, rank[i] * 0.11 + 0.14, progress);

  const floorMat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: floorFragment, transparent: true, depthWrite: false }), []);
  const backMat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: backdropFragment }), []);
  useEffect(
    () => () => {
      floorMat.dispose();
      backMat.dispose();
    },
    [floorMat, backMat],
  );

  useFrame((_, dt) => {
    const g = room.current;
    if (!g) return;
    const p = pointer.current;
    if (!frozen) {
      easing.damp(g.rotation, "y", p.x * TURN.y, 0.35, dt);
      easing.damp(g.rotation, "x", -p.y * TURN.x, 0.35, dt);
    }
    easing.damp(camera.position, "z", CAMERA.z - progress * CAMERA.dolly, 0.3, dt);
    camera.lookAt(0, 0.2, -1);
  });

  const centrePose = poses[centre];
  return (
    <group ref={room}>
      <mesh material={backMat} position={[0, 2, -9]} raycast={() => null}>
        <planeGeometry args={[40, 20]} />
      </mesh>
      {/* Reflections first, under the translucent floor */}
      {slots.map((poseIndex, i) => (
        <Pane key={`r${i}`} texture={textures[poseIndex]} pose={poses[poseIndex]} angle={angles[i]} fade={fadeOf(i)} reflect hovered={false} pointer={pointer} />
      ))}
      {centrePose && <Figure texture={textures[centre]} pose={centrePose} reflect flashKey={centre} />}
      <mesh material={floorMat} rotation-x={-Math.PI / 2} position={[0, FLOOR_Y, 0]} renderOrder={0} raycast={() => null}>
        <planeGeometry args={[30, 30]} />
      </mesh>
      {slots.map((poseIndex, i) => (
        <Pane
          key={`m${i}`}
          texture={textures[poseIndex]}
          pose={poses[poseIndex]}
          angle={angles[i]}
          fade={fadeOf(i)}
          reflect={false}
          hovered={hovered === i}
          pointer={pointer}
          onOver={() => {
            setHovered(i);
            if (fadeOf(i) > 0.3) onHoverMirror(i);
          }}
          onOut={() => setHovered((h) => (h === i ? null : h))}
          onClick={onClickMirror}
        />
      ))}
      {centrePose && <Figure texture={textures[centre]} pose={centrePose} reflect={false} flashKey={centre} />}
      <Ready onReady={onReady} />
    </group>
  );
}

/** Desktop only (MirrorHero renders a still arc elsewhere). */
export default function MirrorScene(props: Props) {
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
    <div ref={wrapRef} className="absolute inset-0" data-cursor-label={props.frozen ? "Release" : "Freeze"}>
      <Canvas
        dpr={dpr}
        frameloop={inView ? "always" : "never"}
        camera={{ fov: CAMERA.fov, position: [0, CAMERA.y, CAMERA.z], near: 0.1, far: 50 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance", stencil: false }}
      >
        <color attach="background" args={["#060606"]} />
        <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
        <Suspense fallback={null}>
          <Room {...props} />
        </Suspense>
      </Canvas>
    </div>
  );
}
