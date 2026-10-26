"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { HeroFloatingType } from "@/data/hero-config";
import { useHeroStore } from "@/store/heroStore";

/**
 * Sprint 13 — a school of glowing shapes circling the character's head (the
 * "fish" reference). ONE InstancedMesh = one draw call whatever the count:
 * buffers are sized for MAX_INSTANCES up front and `mesh.count` decides how
 * many draw, so the admin's count slider never reallocates anything.
 *
 * Each instance has its own orbit: radius 1.5–3.5, speed 0.2–1.0 rad/s,
 * phase, height offset, a tilted orbit plane and a bob. Positions are
 * recomputed in useFrame from those parameters (no per-frame allocations);
 * colours ease towards the store's theme in place, so a palette change
 * glides instead of popping, without a React render.
 */

export const MAX_INSTANCES = 500;
/** Instance colours are pushed above 1 so they clear Bloom's 0.8 luminance threshold. */
const GLOW = 1.8;

/** mulberry32 — a tiny seeded PRNG, so the same seed always draws the same orbit. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Orbits = {
  radius: Float32Array;
  speed: Float32Array;
  phase: Float32Array;
  yOffset: Float32Array;
  tilt: Float32Array;
  dir: Float32Array;
  bob: Float32Array;
  scale: Float32Array;
  /** 0 → primary, 1 → secondary. */
  mix: Float32Array;
};

function makeOrbits(seed: number): Orbits {
  const rand = prng(seed);
  const f = () => new Float32Array(MAX_INSTANCES);
  const o: Orbits = { radius: f(), speed: f(), phase: f(), yOffset: f(), tilt: f(), dir: f(), bob: f(), scale: f(), mix: f() };
  for (let i = 0; i < MAX_INSTANCES; i++) {
    o.radius[i] = 1.5 + rand() * 2; // 1.5 – 3.5
    o.speed[i] = 0.2 + rand() * 0.8; // 0.2 – 1.0
    o.phase[i] = rand() * Math.PI * 2;
    o.yOffset[i] = (rand() - 0.5) * 0.9;
    o.tilt[i] = (rand() - 0.5) * 1.1; // ±~31° orbit planes
    o.dir[i] = rand() < 0.85 ? 1 : -1; // a school mostly swims one way
    o.bob[i] = 0.6 + rand() * 1.6;
    o.scale[i] = 0.55 + rand() * 0.9;
    // Outer orbits lean to the secondary colour, with some scatter.
    o.mix[i] = Math.min(1, Math.max(0, (o.radius[i] - 1.5) / 2 + (rand() - 0.5) * 0.5));
  }
  return o;
}

/** Small shapes, all centred; "fish" points its nose down +Z so lookAt() aims it along the orbit. */
function makeGeometry(type: HeroFloatingType): THREE.BufferGeometry {
  switch (type) {
    case "orbs":
      return new THREE.IcosahedronGeometry(0.028, 1);
    case "shards":
      return new THREE.OctahedronGeometry(0.045, 0).scale(0.55, 1.5, 0.55);
    case "cubes":
      return new THREE.BoxGeometry(0.045, 0.045, 0.045);
    case "fish":
    default:
      return new THREE.ConeGeometry(0.022, 0.12, 6).rotateX(Math.PI / 2).scale(0.75, 1, 1);
  }
}

type Scratch = {
  dummy: THREE.Object3D;
  look: THREE.Vector3;
  /** Current gradient ends (eased) and their targets. */
  a: THREE.Color;
  b: THREE.Color;
  targetA: THREE.Color;
  targetB: THREE.Color;
  tmp: THREE.Color;
  primed: boolean;
};

const makeScratch = (): Scratch => ({
  dummy: new THREE.Object3D(),
  look: new THREE.Vector3(),
  a: new THREE.Color(),
  b: new THREE.Color(),
  targetA: new THREE.Color(),
  targetB: new THREE.Color(),
  tmp: new THREE.Color(),
  primed: false,
});

type Props = {
  /** The head, in the parent group's space. */
  center: [number, number, number];
  reducedMotion: boolean;
};

export default function FloatingOrbit({ center, reducedMotion }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  // Structural state only — each of these rebuilds something. Everything else is read per frame.
  const floatingType = useHeroStore((s) => s.floatingType);
  const count = useHeroStore((s) => s.count);
  const seed = useHeroStore((s) => s.regenerateKey);

  const orbits = useMemo(() => makeOrbits(seed), [seed]);
  const geometry = useMemo(() => makeGeometry(floatingType), [floatingType]);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  // Per-frame scratch objects, allocated once (lazily, on the first frame).
  const scratchRef = useRef<Scratch | null>(null);
  // A new orbit layout or mesh (shape change) re-colours every instance.
  const dirty = useRef(true);
  useEffect(() => {
    dirty.current = true;
  }, [orbits]);

  // Runs for every new mesh too (a shape change remounts it), so the count and colours carry over.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.count = Math.min(MAX_INSTANCES, count);
    // Instances move every frame; a static bounding sphere would cull the whole orbit.
    mesh.frustumCulled = false;
    dirty.current = true;
  }, [count, floatingType]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const { theme } = useHeroStore.getState();
    const s = (scratchRef.current ??= makeScratch());

    // Ease the gradient ends towards the theme.
    s.targetA.set(theme.primary);
    s.targetB.set(theme.secondary);
    if (!s.primed) {
      s.a.copy(s.targetA);
      s.b.copy(s.targetB);
      s.primed = true;
      dirty.current = true;
    } else {
      const d = Math.abs(s.a.r - s.targetA.r) + Math.abs(s.a.g - s.targetA.g) + Math.abs(s.a.b - s.targetA.b) + Math.abs(s.b.r - s.targetB.r) + Math.abs(s.b.g - s.targetB.g) + Math.abs(s.b.b - s.targetB.b);
      if (d > 0.002) {
        s.a.lerp(s.targetA, 0.08);
        s.b.lerp(s.targetB, 0.08);
        dirty.current = true;
      }
    }

    const t = state.clock.elapsedTime * (reducedMotion ? 0.15 : 1);
    const n = mesh.count;
    const [cx, cy, cz] = center;
    const fish = floatingType === "fish";
    const { dummy, look } = s;
    for (let i = 0; i < n; i++) {
      const r = orbits.radius[i];
      const dir = orbits.dir[i];
      const ang = orbits.phase[i] + t * orbits.speed[i] * dir;
      const cosT = Math.cos(orbits.tilt[i]);
      const sinT = Math.sin(orbits.tilt[i]);
      const lx = Math.cos(ang) * r;
      const lz = Math.sin(ang) * r;
      const ly = orbits.yOffset[i] + Math.sin(t * orbits.bob[i] + orbits.phase[i]) * 0.12;
      // Tilt the orbit plane around X.
      dummy.position.set(cx + lx, cy + ly * cosT - lz * sinT, cz + ly * sinT + lz * cosT);
      const sc = orbits.scale[i] * (0.85 + 0.15 * Math.sin(t * 2.3 + orbits.phase[i]));
      dummy.scale.setScalar(sc);
      if (fish) {
        // Aim along the orbit's tangent (same tilt), so the school swims nose-first.
        const tx = -Math.sin(ang) * dir;
        const tz = Math.cos(ang) * dir;
        look.set(dummy.position.x + tx, dummy.position.y - tz * sinT, dummy.position.z + tz * cosT);
        dummy.lookAt(look);
      } else {
        dummy.rotation.set(t * 0.7 + orbits.phase[i], t * 1.1 + orbits.phase[i] * 0.5, 0);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (dirty.current) {
        s.tmp.copy(s.a).lerp(s.b, orbits.mix[i]).multiplyScalar(GLOW);
        mesh.setColorAt(i, s.tmp);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (dirty.current && mesh.instanceColor) {
      // Hidden instances (past `count`) get coloured too, so raising the count never shows black ones.
      for (let i = n; i < MAX_INSTANCES; i++) {
        s.tmp.copy(s.a).lerp(s.b, orbits.mix[i]).multiplyScalar(GLOW);
        mesh.setColorAt(i, s.tmp);
      }
      mesh.instanceColor.needsUpdate = true;
      dirty.current = false;
    }
  });

  return (
    // Keyed by geometry: a new shape gets a fresh mesh (InstancedMesh args are constructor-only).
    // setColorAt() creates instanceColor on the first frame; three picks the instanced-colour shader per object.
    // dispose={null}: geometry + material are owned (and disposed) by the effects above.
    <instancedMesh key={floatingType} ref={meshRef} args={[geometry, material, MAX_INSTANCES]} renderOrder={2} dispose={null} />
  );
}
