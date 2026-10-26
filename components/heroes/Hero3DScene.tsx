"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, DepthOfField, EffectComposer, Noise, SMAA, Vignette } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import FloatingOrbit from "@/components/heroes/FloatingOrbit";
import { heroSpin, useHeroStore } from "@/store/heroStore";

/**
 * The 360° hero's WebGL layer, behind the photo sequence (ImageSequenceHero
 * draws the portrait on its own Canvas 2D): the themed background, a school
 * of instanced shapes circling the head and a cinematic post stack. The orbit
 * turns with the photos (heroSpin) plus a slow drift, so the head seems to
 * turn inside it. All transient values are read inside useFrame — nothing
 * here re-renders at frame rate.
 */

/** The point the orbit circles and the camera looks at (screen centre, where the portrait sits). */
const HEAD: [number, number, number] = [0, 1.5, 0];

const ease = (k: number, delta: number) => 1 - Math.exp(-k * delta);

/* ------------------------------------------------------------------ */
/* Theme: background + fog                                             */
/* ------------------------------------------------------------------ */

function Atmosphere() {
  const bg = useRef<THREE.Color>(null);
  const fog = useRef<THREE.Fog>(null);
  const target = useMemo(() => new THREE.Color(), []);
  const primed = useRef(false);

  useFrame((_, delta) => {
    target.set(useHeroStore.getState().theme.background);
    const k = primed.current ? ease(3, delta) : 1;
    primed.current = true;
    bg.current?.lerp(target, k);
    fog.current?.color.lerp(target, k);
  });

  return (
    <>
      <color ref={bg} attach="background" args={["#0a0a0a"]} />
      <fog ref={fog} attach="fog" args={["#0a0a0a", 8, 22]} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Stage                                                               */
/* ------------------------------------------------------------------ */

/** Scales the orbit down on narrow viewports (phones show it smaller, still whole). */
function useStageScale() {
  const width = useThree((s) => s.viewport.width);
  return Math.min(1, Math.max(0.6, width / 5));
}

/** The orbit's turn: the photo sequence's angle, plus the admin's drift. */
function Spin({ reducedMotion, children }: { reducedMotion: boolean; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const drift = useRef(0);
  const speed = useRef(0);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const want = reducedMotion ? 0 : useHeroStore.getState().rotateSpeed * 0.1;
    speed.current += (want - speed.current) * ease(3, delta);
    drift.current += speed.current * delta;
    g.rotation.y = heroSpin.angle + drift.current;
  });
  return (
    <group ref={ref} position={HEAD}>
      {children}
    </group>
  );
}

function Stage({ reducedMotion, onReady }: SceneProps) {
  const scale = useStageScale();
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.lookAt(...HEAD);
    onReady();
  }, [camera, onReady]);

  return (
    <>
      <Atmosphere />
      <Spin reducedMotion={reducedMotion}>
        <group scale={scale}>
          <FloatingOrbit center={[0, 0, 0]} reducedMotion={reducedMotion} />
        </group>
      </Spin>
      <Effects focus={HEAD} />
    </>
  );
}

function Effects({ focus }: { focus: [number, number, number] }) {
  const postFx = useHeroStore((s) => s.postFx);
  const [degraded, setDegraded] = useState(false);
  const coarse = useMemo(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches, []);
  if (!postFx) return null;
  return (
    <>
      {/* Sustained low fps drops the most expensive pass (depth of field) for the session. */}
      <PerformanceMonitor onDecline={() => setDegraded(true)} />
      {/* MSAA off: its depth resolve blit is invalid with the depth texture DOF reads (GL_INVALID_OPERATION); SMAA instead. */}
      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.8} luminanceSmoothing={0.9} height={300} mipmapBlur intensity={1.1} />
        {/* Sharp at the portrait's plane: the near and far arcs of the orbit go soft. */}
        {!coarse && !degraded ? <DepthOfField target={focus} focusDistance={0.01} focalLength={0.02} bokehScale={2} height={480} /> : <></>}
        <Noise opacity={0.02} />
        <Vignette eskil={false} offset={0.1} darkness={1.1} />
        {coarse ? <></> : <SMAA />}
      </EffectComposer>
    </>
  );
}

type SceneProps = {
  reducedMotion: boolean;
  /** Pauses rendering entirely while the hero is off-screen. */
  active: boolean;
  onReady: () => void;
};

export default function Hero3DScene(props: SceneProps) {
  return (
    <Canvas
      camera={{ position: [0, HEAD[1], 5], fov: 45, near: 0.1, far: 60 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      frameloop={props.active ? "always" : "never"}
      aria-hidden
    >
      <Stage {...props} />
    </Canvas>
  );
}
