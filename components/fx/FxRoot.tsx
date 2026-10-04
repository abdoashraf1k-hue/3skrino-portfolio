"use client";

import dynamic from "next/dynamic";

/** The cinematic toolbox loads in its own chunk, after hydration — it never blocks first paint. */
const CinematicFx = dynamic(() => import("./CinematicFx"), { ssr: false });

export default function FxRoot() {
  return <CinematicFx />;
}
